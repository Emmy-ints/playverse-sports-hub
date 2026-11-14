/**
 * Authoritative racing simulation (pure TypeScript): arcade-realistic car handling (engine, drag,
 * tyre grip with slides and handbrake drifts, slower on grass), barriers, car-to-car contact,
 * laps, positions and finishing. Deterministic for a given input stream; used by practice,
 * the AI and the real-time game server.
 *
 * Heading h: forward = (sin h, −cos h) on the XZ plane (h = 0 faces −Z).
 */
import { along, buildTrack, indexAt, lateral, nearest, type Track, type TrackDef } from "./track.ts";

export interface CarInput {
  seq: number;
  steer: number; // −1 (left) .. 1 (right)
  throttle: number; // 0..1
  brake: number; // 0..1 (brake, and reverse when stopped)
  handbrake: boolean;
}

export interface CarState {
  x: number; z: number; h: number;
  vx: number; vz: number;
  yaw: number; // yaw rate rad/s
  steer: number; // smoothed steering
  idx: number; // nearest track sample
  s: number; // distance along the lap
  lap: number; // completed laps
  halfway: boolean;
  progress: number; // lap * length + s (for positions)
  finished: boolean;
  finishTime: number;
  bestLap: number;
  lapStart: number;
  offTrack: boolean;
  drift: number; // 0..1 slide amount (for smoke / sound)
  hit: number; // time of the last impact
  lastSeq: number;
  input: CarInput;
  /** Wrong-way / reset helper: time spent stuck. */
  stuck: number;
}

export type RacePhase = "countdown" | "racing" | "finished";

export interface RaceEvent { t: number; kind: "lap" | "finish" | "impact" | "start" | "best"; car?: number; detail?: string }

export interface RaceState {
  t: number;
  phase: RacePhase;
  startAt: number;
  endAt: number;
  laps: number;
  trackId: TrackDef["id"];
  cars: CarState[];
  finishOrder: number[];
  events: RaceEvent[];
  /** Practice weather: 0 dry (default, used online) … 1 soaking. Less grip and longer braking. */
  wet?: number;
  /** Practice car class: "formula" = lighter, faster, more downforce. Absent = GT (used online). */
  car?: "gt" | "formula";
}

const MAX_SPEED = 72; // m/s ≈ 260 km/h
const ACCEL = 16;
const BRAKE = 30;
const DRAG = 0.0031; // per (m/s)² so that engine ≈ drag at top speed
const WHEELBASE = 2.7;
const CAR_R = 1.45;
export const COUNTDOWN = 3;
const FINISH_GRACE = 30;

export function emptyInput(seq = 0): CarInput {
  return { seq, steer: 0, throttle: 0, brake: 0, handbrake: false };
}

export function createRace(trackId: TrackDef["id"], cars: number, laps: number): RaceState {
  const t = buildTrack(trackId);
  const list: CarState[] = [];
  for (let i = 0; i < cars; i++) {
    // Staggered grid behind the start line.
    const back = 8 + Math.floor(i / 2) * 9 + (i % 2) * 3;
    const side = (i % 2 === 0 ? 1 : -1) * t.halfWidth * 0.42;
    const si = indexAt(t, t.length - back);
    const tx = t.tx[si]!, tz = t.tz[si]!;
    const x = t.x[si]! + tz * side, z = t.z[si]! - tx * side;
    const h = Math.atan2(tx, -tz);
    list.push({
      x, z, h, vx: 0, vz: 0, yaw: 0, steer: 0, idx: si, s: t.length - back, lap: -1, halfway: true, progress: -back,
      finished: false, finishTime: 0, bestLap: 0, lapStart: 0, offTrack: false, drift: 0, hit: -10, lastSeq: -1, input: emptyInput(), stuck: 0,
    });
  }
  return { t: 0, phase: "countdown", startAt: COUNTDOWN, endAt: 0, laps, trackId, cars: list, finishOrder: [], events: [] };
}

export function sanitizeCarInput(raw: unknown): CarInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const c = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return { seq: Math.floor(num(r["seq"], -1)), steer: c(num(r["steer"]), -1, 1), throttle: c(num(r["throttle"]), 0, 1), brake: c(num(r["brake"]), 0, 1), handbrake: r["handbrake"] === true };
}

export function applyCarInput(s: RaceState, car: number, input: CarInput) {
  const c = s.cars[car];
  if (!c || input.seq <= c.lastSeq) return;
  c.lastSeq = input.seq;
  c.input = input;
}

export function stepRace(s: RaceState, dt: number) {
  const sub = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / sub;
  for (let i = 0; i < sub; i++) tick(s, h);
}

function tick(s: RaceState, dt: number) {
  s.t += dt;
  const track = buildTrack(s.trackId);
  if (s.phase === "countdown") {
    if (s.t >= s.startAt) {
      s.phase = "racing";
      s.cars.forEach((c) => (c.lapStart = s.startAt));
      s.events.push({ t: s.t, kind: "start" });
    }
    return;
  }
  if (s.phase === "finished") return;
  s.cars.forEach((c, i) => driveCar(s, track, c, i, dt));
  collide(s);
  s.cars.forEach((c, i) => updateProgress(s, track, c, i));
  if (s.finishOrder.length > 0 && (s.finishOrder.length === s.cars.length || s.t > s.endAt)) {
    // Everyone else is classified by distance covered.
    const rest = s.cars.map((c, i) => ({ c, i })).filter(({ c }) => !c.finished).sort((a, b) => b.c.progress - a.c.progress);
    for (const { i } of rest) s.finishOrder.push(i);
    s.phase = "finished";
  }
}

function driveCar(s: RaceState, t: Track, c: CarState, i: number, dt: number) {
  const inp = c.finished ? { ...emptyInput(), brake: 0.4 } : c.input;
  const fx = Math.sin(c.h), fz = -Math.cos(c.h);
  const rx = -fz, rz = fx; // right
  let vF = c.vx * fx + c.vz * fz;
  let vR = c.vx * rx + c.vz * rz;
  const speed = Math.hypot(c.vx, c.vz);
  const grass = c.offTrack;

  // Longitudinal: engine (weaker near top speed), brakes, reverse, drag, rolling resistance.
  const f1 = s.car === "formula";
  const top = (grass ? MAX_SPEED * 0.45 : MAX_SPEED) * (f1 ? 1.16 : 1);
  let a = 0;
  if (inp.throttle > 0) a += inp.throttle * ACCEL * (f1 ? 1.3 : 1) * Math.max(0.15, 1 - (vF / top) ** 2) * (vF < 18 ? 1.25 : 1);
  const wet = s.wet ?? 0;
  if (inp.brake > 0) a -= vF > 0.5 ? inp.brake * BRAKE * (f1 ? 1.25 : 1) * (1 - wet * 0.3) : vF > -12 ? inp.brake * 7 : 0;
  a -= DRAG * vF * Math.abs(vF) + (grass ? 2.2 : 0.35) * Math.sign(vF);
  if (inp.handbrake) a -= Math.sign(vF) * 6;
  vF += a * dt;
  if (Math.abs(vF) < 0.05 && inp.throttle === 0 && inp.brake === 0) vF = 0;

  // Steering: smoothed, less lock at speed.
  const lock = 0.62 / (1 + speed / 22);
  c.steer += (inp.steer * lock - c.steer) * Math.min(1, dt * 9);
  const targetYaw = (vF / WHEELBASE) * Math.tan(c.steer);
  // Tyre grip: lateral velocity bleeds off; handbrake/grass reduce grip so the rear slides.
  const grip = (inp.handbrake ? 1.6 : grass ? 3.2 : 9.5) * (1 - wet * 0.4) * (f1 && !grass ? 1.3 : 1);
  const yawResponse = inp.handbrake ? 3.5 : 7;
  c.yaw += (targetYaw * (inp.handbrake ? 1.35 : 1) - c.yaw) * Math.min(1, dt * yawResponse);
  c.h += c.yaw * dt;
  // Sliding: the body rotates faster than the velocity follows.
  vR *= Math.exp(-grip * dt);
  // Re-project onto the new heading.
  const nfx = Math.sin(c.h), nfz = -Math.cos(c.h);
  const nrx = -nfz, nrz = nfx;
  // Rotate the velocity a little toward the new heading (grip), the rest becomes slide.
  const turn = c.yaw * dt;
  const keep = vF * Math.cos(turn), slide = vR - vF * Math.sin(turn) * ((inp.handbrake ? 0.75 : 0.15) + wet * 0.12);
  c.vx = nfx * keep + nrx * slide;
  c.vz = nfz * keep + nrz * slide;
  c.drift = Math.min(1, Math.abs(slide) / 6);
  c.x += c.vx * dt;
  c.z += c.vz * dt;

  // Barriers.
  c.idx = nearest(t, c.x, c.z, c.idx);
  const lat = lateral(t, c.idx, c.x, c.z);
  c.offTrack = Math.abs(lat) > t.halfWidth + 0.3;
  if (Math.abs(lat) > t.wall - CAR_R) {
    const nx = t.tz[c.idx]!, nz = -t.tx[c.idx]!; // left normal
    const sign = Math.sign(lat);
    const push = Math.abs(lat) - (t.wall - CAR_R);
    c.x -= nx * sign * push;
    c.z -= nz * sign * push;
    const vn = (c.vx * nx + c.vz * nz) * sign;
    if (vn > 0) {
      c.vx -= nx * sign * vn * 1.35; // bounce off with some energy loss
      c.vz -= nz * sign * vn * 1.35;
      c.vx *= 0.93;
      c.vz *= 0.93;
      if (vn > 4 && s.t - c.hit > 0.4) {
        c.hit = s.t;
        s.events.push({ t: s.t, kind: "impact", car: i, detail: vn.toFixed(1) });
      }
    }
  }
  // Stuck facing a wall or backwards: count up so the client can offer a reset.
  const fwdAlong = Math.sin(c.h) * t.tx[c.idx]! + -Math.cos(c.h) * t.tz[c.idx]!;
  c.stuck = speed < 2 || fwdAlong < -0.3 ? c.stuck + dt : 0;
}

function collide(s: RaceState) {
  const cs = s.cars;
  for (let a = 0; a < cs.length; a++) {
    for (let b = a + 1; b < cs.length; b++) {
      const A = cs[a]!, B = cs[b]!;
      // Two circles per car (front and rear) approximate the body.
      for (const fa of [-1.1, 1.1]) {
        for (const fb of [-1.1, 1.1]) {
          const ax = A.x + Math.sin(A.h) * fa, az = A.z - Math.cos(A.h) * fa;
          const bx = B.x + Math.sin(B.h) * fb, bz = B.z - Math.cos(B.h) * fb;
          const dx = bx - ax, dz = bz - az;
          const d = Math.hypot(dx, dz);
          if (d === 0 || d >= CAR_R * 1.5) continue;
          const nx = dx / d, nz = dz / d;
          const pen = CAR_R * 1.5 - d;
          A.x -= nx * pen / 2; A.z -= nz * pen / 2;
          B.x += nx * pen / 2; B.z += nz * pen / 2;
          const rv = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
          if (rv < 0) {
            const j = -(1 + 0.25) * rv / 2;
            A.vx -= j * nx; A.vz -= j * nz;
            B.vx += j * nx; B.vz += j * nz;
            // A nudge spins the cars a little.
            A.yaw += (fa * 0.08) * Math.sign(rv);
            B.yaw -= (fb * 0.08) * Math.sign(rv);
            if (-rv > 3 && s.t - Math.max(A.hit, B.hit) > 0.4) {
              A.hit = B.hit = s.t;
              s.events.push({ t: s.t, kind: "impact", car: a, detail: (-rv).toFixed(1) });
            }
          }
        }
      }
    }
  }
}

function updateProgress(s: RaceState, t: Track, c: CarState, i: number) {
  if (c.finished) return;
  const prev = c.s;
  const now = along(t, c.idx, c.x, c.z);
  c.s = now;
  if (now > t.length * 0.4 && now < t.length * 0.6) c.halfway = true;
  // Crossed the line forwards (wrapped from the end of the lap to the start).
  if (prev > t.length * 0.8 && now < t.length * 0.2) {
    if (c.halfway) {
      c.halfway = false;
      c.lap += 1;
      if (c.lap >= 1) {
        const time = s.t - c.lapStart;
        const best = c.bestLap === 0 || time < c.bestLap;
        if (best) c.bestLap = time;
        s.events.push({ t: s.t, kind: "lap", car: i, detail: `${c.lap}:${time.toFixed(3)}${best ? ":best" : ""}` });
      }
      c.lapStart = s.t;
      if (c.lap >= s.laps) {
        c.finished = true;
        c.finishTime = s.t - s.startAt;
        s.finishOrder.push(i);
        if (s.finishOrder.length === 1) s.endAt = s.t + FINISH_GRACE;
        s.events.push({ t: s.t, kind: "finish", car: i, detail: String(s.finishOrder.length) });
      }
    }
  } else if (prev < t.length * 0.2 && now > t.length * 0.8) {
    // Reversed back over the line: undo.
    if (c.lap >= 0) {
      c.lap -= 1;
      c.halfway = true;
    }
  }
  c.progress = c.lap * t.length + c.s;
}

/** Live positions (1-based order of car indices). */
export function standings(s: RaceState): number[] {
  const fin = [...s.finishOrder];
  const rest = s.cars.map((c, i) => ({ c, i })).filter(({ i }) => !fin.includes(i)).sort((a, b) => b.c.progress - a.c.progress).map(({ i }) => i);
  return [...fin, ...rest];
}

/** Put a stuck car back on the centre line facing the right way (costs a couple of seconds). */
export function resetCar(s: RaceState, car: number) {
  const t = buildTrack(s.trackId);
  const c = s.cars[car];
  if (!c || c.finished || s.phase !== "racing" || c.stuck < 2) return false;
  const i = c.idx;
  c.x = t.x[i]!;
  c.z = t.z[i]!;
  c.h = Math.atan2(t.tx[i]!, -t.tz[i]!);
  c.vx = c.vz = c.yaw = c.steer = 0;
  c.stuck = 0;
  return true;
}

/** AI driver: follow the centre line with a lookahead, brake for corners based on curvature. */
export function aiDrive(s: RaceState, car: number, skill = 0.8, seq = 0): CarInput {
  const t = buildTrack(s.trackId);
  const c = s.cars[car]!;
  const speed = Math.hypot(c.vx, c.vz);
  const look = 9 + speed * 0.55;
  const ti = indexAt(t, c.s + look);
  // Racing line: cut a little toward the inside of the coming bend.
  const inside = Math.max(-1, Math.min(1, -t.curv[ti]! * 60)) * t.halfWidth * 0.45 * skill;
  const px = t.x[ti]! + t.tz[ti]! * inside, pz = t.z[ti]! - t.tx[ti]! * inside;
  const want = Math.atan2(px - c.x, -(pz - c.z));
  let d = want - c.h;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const steer = Math.max(-1, Math.min(1, d * 2.6));
  // Corner speed: the tightest curvature in the braking zone ahead.
  const latG = (14 + 10 * skill) * (1 - (s.wet ?? 0) * 0.35) * (s.car === "formula" ? 1.3 : 1); // m/s² of grip the driver dares to use
  let vMax = MAX_SPEED;
  for (let ahead = 0; ahead < 140; ahead += 6) {
    const k = Math.abs(t.curv[indexAt(t, c.s + ahead)]!);
    if (k < 1e-4) continue;
    const vc = Math.sqrt(latG / k);
    // Can we slow from the current speed to vc over `ahead` metres?
    const reach = Math.sqrt(vc * vc + 2 * BRAKE * 0.75 * ahead);
    vMax = Math.min(vMax, reach);
  }
  vMax *= 0.9 + 0.1 * skill;
  // Don't drive into a slower car directly ahead (e.g. someone stopped on the grid): follow or slow down.
  const fx = Math.sin(c.h), fz = -Math.cos(c.h);
  for (let j = 0; j < s.cars.length; j++) {
    if (j === car) continue;
    const o = s.cars[j]!;
    const dx = o.x - c.x, dz = o.z - c.z;
    const along = dx * fx + dz * fz;
    if (along <= 0 || along > 14) continue;
    const side = Math.abs(dx * -fz + dz * fx);
    if (side > 2.1) continue;
    const ov = o.vx * fx + o.vz * fz;
    vMax = Math.min(vMax, Math.max(0, ov + (along - 5) * 1.2));
  }
  const throttle = speed < vMax - 1 ? 1 : speed < vMax + 1 ? 0.4 : 0;
  const brake = speed > vMax + 3 ? Math.min(1, (speed - vMax) / 8) : 0;
  return { seq, steer, throttle, brake, handbrake: false };
}

export function takeRaceEvents(s: RaceState): RaceEvent[] {
  const e = s.events;
  s.events = [];
  return e;
}

/** End the race now (time limit or forfeit): unfinished cars are classified by distance covered. */
export function forceFinish(s: RaceState, loser?: number) {
  if (s.phase === "finished") return;
  const rest = s.cars.map((c, i) => ({ c, i })).filter(({ i }) => !s.finishOrder.includes(i));
  rest.sort((a, b) => (a.i === loser ? 1 : b.i === loser ? -1 : b.c.progress - a.c.progress));
  for (const { i } of rest) s.finishOrder.push(i);
  s.phase = "finished";
  s.events.push({ t: s.t, kind: "finish", detail: loser !== undefined ? "forfeit" : "time" });
}
