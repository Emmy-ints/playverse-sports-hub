/**
 * Athletics events (pure TypeScript, deterministic, shared by practice, AI and the game server).
 *
 * Running works like the classic mobile athletics games: on-screen prompts ask for LEFT or RIGHT;
 * each correct, well-timed tap adds speed, a wrong tap breaks your stride. ACTION jumps a hurdle,
 * takes off at the long-jump board or starts the javelin throw; holding ACTION raises the angle
 * meter and releasing it commits.
 *
 * Coordinates: athletes run along +x. 100 m: start x=0, finish x=100. Hurdles: 110 m. Long jump:
 * board at x=0 after a 40 m runway. Javelin: foul line at x=0 after a 30 m runway. Pole vault: plant box
 * at x=0 after a 35 m runway; the mark is the height cleared.
 */

export type EventId = "sprint100" | "hurdles110" | "longjump" | "javelin" | "polevault";
export type Key = "L" | "R" | "A";

export const EVENTS: Record<EventId, { name: string; short: string; kind: "race" | "field"; attempts: number; runway: number; length: number }> = {
  sprint100: { name: "100m Dash", short: "100m", kind: "race", attempts: 1, runway: 0, length: 100 },
  hurdles110: { name: "110m Hurdles", short: "Hurdles", kind: "race", attempts: 1, runway: 0, length: 110 },
  longjump: { name: "Long Jump", short: "Long jump", kind: "field", attempts: 3, runway: 40, length: 0 },
  javelin: { name: "Javelin", short: "Javelin", kind: "field", attempts: 3, runway: 30, length: 0 },
  polevault: { name: "Pole Vault", short: "Pole vault", kind: "field", attempts: 3, runway: 35, length: 0 },
};
export const EVENT_ORDER: EventId[] = ["sprint100", "hurdles110", "longjump", "javelin", "polevault"];

/** Pole vault: plant ~4 m before the box; holding ACTION bends the pole, releasing at ~68° on the meter is ideal. */
export const PV = { box: 0, idealTakeoff: -4, idealAngle: 68, maxAngle: 80, rate: 100, matX: 1.6 } as const;

export const HURDLES = Array.from({ length: 10 }, (_, k) => 13.72 + 9.14 * k);
const G = 9.81;
const VMAX = 12.2; // m/s, absolute ceiling
const TAP_GAIN = 0.8; // m/s per perfect tap at low speed
const DRAG = 0.36; // fractional speed loss per second without taps
const READY_TIME = 3.2; // "On your marks… set…" then the gun

export interface InputEvent { seq: number; key: Key; down: boolean }

export type Phase = "marks" | "running" | "air" | "aiming" | "flight" | "done";

export interface Athlete {
  x: number; y: number; v: number;
  phase: Phase;
  /** Index and key of the next prompt in this athlete's sequence. */
  promptIdx: number;
  prompt: "L" | "R";
  /** Time of the last correct tap (rhythm). */
  lastTap: number;
  stumbleUntil: number;
  falseStart: boolean;
  /** Race: finish time (s) or null. Field: best mark (m) or null; marks per attempt. */
  finish: number | null;
  marks: (number | null)[];
  attempt: number;
  /** Aim meter for field events (degrees) and when ACTION went down. */
  angle: number;
  actionAt: number;
  /** Jump/throw flight state. */
  airT: number;
  airDur: number;
  takeoffX: number;
  flightV: number;
  flightAngle: number;
  /** Horizontal flight speed (jumper or javelin). */
  fvx: number;
  /** Javelin position in flight (for drawing). */
  jx: number; jy: number;
  knocked: number[];
  steps: number;
  lastSeq: number;
  /** Stride animation phase (radians) and lean. */
  stride: number;
}

export interface EventEvent { t: number; kind: "gun" | "false_start" | "hurdle_hit" | "takeoff" | "land" | "throw" | "foul" | "finish" | "attempt" | "done" | "step" | "wrong"; a?: number; detail?: string }

export interface EventState {
  event: EventId;
  t: number;
  /** When the gun fires / the attempt window opens. */
  goAt: number;
  phase: "ready" | "live" | "over";
  athletes: Athlete[];
  seed: number;
  events: EventEvent[];
  /** Order athletes finished (races). */
  order: number[];
  /** Field events: when the next round of attempts lines up (0 = not scheduled). */
  nextAt: number;
}

function hash(seed: number, i: number) {
  let t = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** The prompt sequence: mostly alternating, sometimes the same key twice (you must read it). */
export function promptAt(seed: number, lane: number, idx: number): "L" | "R" {
  let k: "L" | "R" = "L";
  // Walk deterministically so each prompt depends on the previous one.
  for (let i = 1; i <= idx; i++) k = hash(seed + lane * 7919, i) < 0.22 ? k : k === "L" ? "R" : "L";
  return k;
}

/** Fast incremental version of promptAt for the next index. */
function nextPrompt(seed: number, lane: number, idx: number, prev: "L" | "R"): "L" | "R" {
  return hash(seed + lane * 7919, idx) < 0.22 ? prev : prev === "L" ? "R" : "L";
}

const newAthlete = (): Athlete => ({
  x: 0, y: 0, v: 0, phase: "marks", promptIdx: 0, prompt: "L", fvx: 0, lastTap: -1, stumbleUntil: 0, falseStart: false, finish: null, marks: [], attempt: 0,
  angle: 0, actionAt: -1, airT: 0, airDur: 0, takeoffX: 0, flightV: 0, flightAngle: 0, jx: 0, jy: 0, knocked: [], steps: 0, lastSeq: -1, stride: 0,
});

export function createEvent(event: EventId, athletes: number, seed = 1): EventState {
  const s: EventState = { event, t: 0, goAt: READY_TIME, phase: "ready", athletes: [], seed: seed >>> 0, events: [], order: [], nextAt: 0 };
  for (let i = 0; i < athletes; i++) s.athletes.push(newAthlete());
  resetAttempt(s);
  return s;
}

function resetAttempt(s: EventState) {
  const runway = EVENTS[s.event].runway;
  for (const a of s.athletes) {
    if (a.phase === "done" && EVENTS[s.event].kind === "race") continue;
    a.x = -runway;
    a.y = 0;
    a.v = 0;
    a.phase = "marks";
    a.angle = 0;
    a.actionAt = -1;
    a.airT = 0;
    a.falseStart = false;
    a.stumbleUntil = 0;
    a.lastTap = -1;
  }
}

/** The prompt an athlete must press next. */
export function currentPrompt(s: EventState, i: number): "L" | "R" {
  return s.athletes[i]?.prompt ?? "L";
}

export function applyEventInput(s: EventState, i: number, e: InputEvent) {
  const a = s.athletes[i];
  if (!a || e.seq <= a.lastSeq) return;
  a.lastSeq = e.seq;
  if (s.phase === "over" || a.phase === "done" || a.phase === "flight") return;
  const t = s.t;
  const field = EVENTS[s.event].kind === "field";
  if (e.key === "A") {
    if (e.down) {
      if (a.phase !== "running" || t < s.goAt) return;
      if (s.event === "hurdles110") {
        // Jump: airborne for a short arc; speed carries.
        a.phase = "air";
        a.airT = 0;
        a.airDur = 0.52;
        s.events.push({ t, kind: "takeoff", a: i });
      } else if (field) {
        a.phase = "aiming";
        a.actionAt = t;
        a.takeoffX = a.x;
        a.angle = 0;
        if (s.event === "polevault" && a.x > PV.box + 0.4) return foul(s, i);
        if (s.event === "polevault") a.jx = a.v; // speed at the plant drives the vault
        s.events.push({ t, kind: s.event === "javelin" ? "throw" : "takeoff", a: i, detail: "start" });
      }
    } else if (a.phase === "aiming") {
      release(s, i);
    }
    return;
  }
  if (!e.down) return;
  if (a.phase !== "marks" && a.phase !== "running") return;
  if (t < s.goAt) {
    // Moving before the gun: false start (penalty: frozen for 1 s after the gun).
    if (!a.falseStart && EVENTS[s.event].kind === "race") {
      a.falseStart = true;
      a.stumbleUntil = s.goAt + 1;
      s.events.push({ t, kind: "false_start", a: i });
    }
    return;
  }
  if (t < a.stumbleUntil) return;
  const want = currentPrompt(s, i);
  if (e.key !== want) {
    a.v *= 0.82;
    a.stumbleUntil = t + 0.12;
    s.events.push({ t, kind: "wrong", a: i });
    return;
  }
  // Correct tap: speed gain depends on rhythm (too slow wastes it, mashing is capped).
  const gap = a.lastTap < 0 ? 0.2 : t - a.lastTap;
  const rhythm = gap < 0.055 ? 0.35 : gap < 0.075 ? 0.75 : gap > 0.45 ? 0.6 : 1;
  const ceiling = s.event === "javelin" ? 8.6 : s.event === "polevault" ? 9.9 : VMAX;
  a.v = Math.min(ceiling, a.v + TAP_GAIN * rhythm * (1 - (a.v / ceiling) ** 2.2) * (a.v < 3 ? 1.7 : 1));
  a.lastTap = t;
  a.steps++;
  a.phase = "running";
  const prev = want;
  a.promptIdx++;
  a.prompt = nextPrompt(s.seed, i, a.promptIdx, prev);
  s.events.push({ t, kind: "step", a: i });
}

function release(s: EventState, i: number) {
  const a = s.athletes[i]!;
  const held = s.t - a.actionAt;
  const maxAngle = s.event === "longjump" ? 50 : s.event === "polevault" ? PV.maxAngle : 60;
  a.angle = Math.min(maxAngle, held * (s.event === "longjump" ? 70 : s.event === "polevault" ? PV.rate : 75));
  const t = s.t;
  if (s.event === "polevault") {
    // Energy from the run-up converts to height; a bad plant spot or bend timing wastes it.
    const plant = 1 - Math.min(1, Math.abs(a.takeoffX - PV.idealTakeoff) / 3) * 0.55;
    const bend = Math.max(0, Math.cos((((a.angle - PV.idealAngle) * 1.6) * Math.PI) / 180)) ** 2;
    const v = Math.max(a.v, a.jx);
    const h = 1.2 + ((v * v) / (2 * G)) * plant * (0.35 + 0.65 * bend) + 0.5 * bend;
    a.phase = "flight";
    a.flightAngle = a.angle;
    a.flightV = Math.round(h * 100) / 100;
    // Rise to the bar, then drop onto the mat.
    a.airDur = Math.sqrt((2 * Math.max(0.3, h - 1)) / G) + Math.sqrt((2 * Math.max(0.3, h - 0.9)) / G) + 0.35;
    a.airT = 0;
    a.fvx = (PV.matX - a.x) / a.airDur;
    a.v = 0;
    s.events.push({ t, kind: "takeoff", a: i, detail: a.angle.toFixed(0) });
    return;
  }
  if (s.event === "longjump") {
    if (a.takeoffX > 0.0) {
      foul(s, i);
      return;
    }
    a.phase = "flight";
    a.flightAngle = a.angle;
    const th = (a.angle * Math.PI) / 180;
    // Humans can only redirect part of their run-up speed upward.
    a.flightV = a.v;
    const vx = a.v * Math.cos(th) * 0.9, vy = a.v * Math.sin(th) * 0.7;
    a.airDur = (2 * vy) / G;
    a.airT = 0;
    a.fvx = vx;
    s.events.push({ t, kind: "takeoff", a: i, detail: a.angle.toFixed(0) });
  } else {
    if (a.x > 0) {
      foul(s, i);
      return;
    }
    a.phase = "flight";
    a.flightAngle = a.angle;
    const th = (a.angle * Math.PI) / 180;
    const vr = 13 + 1.95 * a.v; // release speed from run-up
    // Aerodynamics: the javelin flies best around 36°.
    const eff = Math.cos(((a.angle - 36) * Math.PI) / 180) ** 2;
    a.flightV = vr * (0.82 + 0.18 * eff);
    const vx = a.flightV * Math.cos(th), vy = a.flightV * Math.sin(th);
    a.airDur = (vy + Math.sqrt(vy * vy + 2 * G * 1.9)) / G;
    a.airT = 0;
    a.jx = a.x;
    a.jy = 1.9;
    a.fvx = vx;
    a.v *= 0.3;
    s.events.push({ t, kind: "throw", a: i, detail: a.angle.toFixed(0) });
  }
}

function foul(s: EventState, i: number) {
  const a = s.athletes[i]!;
  a.marks.push(null);
  a.phase = "done";
  a.v *= 0.2;
  s.events.push({ t: s.t, kind: "foul", a: i });
  attemptOver(s, i);
}

function attemptOver(s: EventState, i: number) {
  const a = s.athletes[i]!;
  a.attempt++;
  const valid = a.marks.filter((m): m is number => m !== null);
  a.finish = valid.length ? Math.max(...valid) : null;
  s.events.push({ t: s.t, kind: "attempt", a: i, detail: String(a.marks[a.marks.length - 1] ?? "foul") });
}

export function stepEvent(s: EventState, dt: number) {
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let k = 0; k < n; k++) tick(s, dt / n);
}

function tick(s: EventState, dt: number) {
  s.t += dt;
  if (s.phase === "over") return;
  if (s.phase === "ready" && s.t >= s.goAt) {
    s.phase = "live";
    s.events.push({ t: s.t, kind: "gun" });
  }
  const race = EVENTS[s.event].kind === "race";
  s.athletes.forEach((a, i) => {
    // Stride phase advances with distance covered (for animation).
    if (a.phase === "running" || a.phase === "marks") {
      const drag = a.phase === "running" ? DRAG * (a.v > 9 ? 1.15 : 1) : 0;
      a.v = Math.max(0, a.v - a.v * drag * dt);
      a.x += a.v * dt;
      a.stride += a.v * dt * 1.25;
      if (s.event === "hurdles110") hurdleCheck(s, a, i);
      if (s.event === "longjump" && a.phase === "running" && a.x > 1.2) foul(s, i); // ran through the board
      if (s.event === "javelin" && a.phase === "running" && a.x > 0.5) foul(s, i);
      if (s.event === "polevault" && a.phase === "running" && a.x > PV.box + 0.6) foul(s, i); // ran past the box
    } else if (a.phase === "air") {
      a.airT += dt;
      a.x += a.v * dt;
      a.stride += a.v * dt * 0.4;
      a.y = Math.sin(Math.min(1, a.airT / a.airDur) * Math.PI) * 0.95;
      if (a.airT >= a.airDur) {
        a.phase = "running";
        a.y = 0;
        s.events.push({ t: s.t, kind: "land", a: i });
      }
    } else if (a.phase === "aiming") {
      // Long jump: still moving through the take-off; javelin: crossover steps.
      a.x += a.v * dt * (s.event === "javelin" ? 0.45 : s.event === "polevault" ? 0.7 : 1);
      a.v *= 1 - dt * (s.event === "polevault" ? 0.15 : 0.3);
      if (s.event === "polevault" && a.x > PV.box + 0.4) foul(s, i);
      else if (s.t - a.actionAt > (s.event === "polevault" ? 0.85 : 0.75)) release(s, i); // auto-release at the top of the meter
    } else if (a.phase === "flight") {
      const vx = a.fvx;
      a.airT += dt;
      if (s.event === "polevault") {
        a.x += vx * dt;
        const h = a.flightV;
        const up = Math.sqrt((2 * Math.max(0.3, h - 1)) / G);
        const peakY = h - 1; // hips clear the bar
        if (a.airT < up) a.y = peakY * Math.sin((a.airT / up) * (Math.PI / 2));
        else a.y = Math.max(0.8, peakY - 0.5 * G * (a.airT - up) ** 2); // lands on the mat
        if (a.airT >= a.airDur) {
          a.marks.push(h);
          a.phase = "done";
          a.y = 0.8;
          s.events.push({ t: s.t, kind: "land", a: i, detail: h.toFixed(2) });
          attemptOver(s, i);
        }
      } else if (s.event === "longjump") {
        a.x += vx * dt;
        const vy0 = (a.airDur * G) / 2;
        a.y = Math.max(0, vy0 * a.airT - 0.5 * G * a.airT * a.airT);
        if (a.airT >= a.airDur) {
          const mark = Math.max(0, Math.round((a.x - 0) * 100) / 100);
          a.marks.push(mark);
          a.phase = "done";
          a.y = 0;
          s.events.push({ t: s.t, kind: "land", a: i, detail: mark.toFixed(2) });
          attemptOver(s, i);
        }
      } else {
        const th = (a.flightAngle * Math.PI) / 180;
        const vy0 = a.flightV * Math.sin(th);
        a.jx += vx * dt;
        a.jy = 1.9 + vy0 * a.airT - 0.5 * G * a.airT * a.airT;
        a.x += a.v * dt;
        a.v *= 1 - dt * 2;
        if (a.jy <= 0) {
          const mark = Math.max(0, Math.round(a.jx * 100) / 100);
          a.marks.push(mark);
          a.phase = "done";
          a.jy = 0;
          s.events.push({ t: s.t, kind: "land", a: i, detail: mark.toFixed(2) });
          attemptOver(s, i);
        }
      }
    } else if (a.phase === "done" && race) {
      // Jog down after the line.
      a.v = Math.max(0, a.v - dt * 4);
      a.x += a.v * dt;
      a.stride += a.v * dt * 1.25;
    }
    if (race && a.phase !== "done" && a.x >= EVENTS[s.event].length) {
      a.finish = Math.round((s.t - s.goAt) * 1000) / 1000;
      a.phase = "done";
      s.order.push(i);
      s.events.push({ t: s.t, kind: "finish", a: i, detail: a.finish.toFixed(3) });
    }
  });
  // Next attempt (field) once everyone has finished this one.
  if (!race && s.phase === "live" && s.athletes.every((a) => a.phase === "done")) {
    const attempts = EVENTS[s.event].attempts;
    if (s.athletes.every((a) => a.attempt >= attempts)) {
      s.phase = "over";
      s.events.push({ t: s.t, kind: "done" });
    } else {
      // Short pause, then everyone lines up again.
      if (!s.nextAt) s.nextAt = s.t + 2.4;
      if (s.t >= s.nextAt) {
        s.nextAt = 0;
        s.athletes.forEach((a) => {
          a.phase = "marks";
        });
        resetAttempt(s);
        s.goAt = s.t + 1.2;
        s.phase = "ready";
      }
    }
  }
  // Races end when everyone is home, or 12 s after the winner.
  if (race && s.phase === "live" && (s.order.length === s.athletes.length || (s.order.length > 0 && s.t - s.goAt > (s.athletes[s.order[0]!]!.finish ?? 0) + 12))) {
    s.athletes.forEach((a, i) => {
      if (a.phase !== "done") {
        a.phase = "done";
        s.order.push(i);
      }
    });
    s.phase = "over";
    s.events.push({ t: s.t, kind: "done" });
  }
  // Hard cap: nobody moves for 40 s after the gun (AFK).
  if (s.phase === "live" && s.t - s.goAt > (race ? 60 : 45)) {
    s.athletes.forEach((a, i) => {
      if (a.phase !== "done") {
        if (!race) a.marks.push(null);
        a.phase = "done";
        if (race) s.order.push(i);
        else attemptOver(s, i);
      }
    });
  }
}

function hurdleCheck(s: EventState, a: Athlete, i: number) {
  for (let k = 0; k < HURDLES.length; k++) {
    const h = HURDLES[k]!;
    if (a.knocked.includes(k)) continue;
    if (a.x >= h - 0.15 && a.x <= h + 0.25 && a.phase === "running") {
      a.knocked.push(k);
      a.v *= 0.5;
      a.stumbleUntil = s.t + 0.35;
      s.events.push({ t: s.t, kind: "hurdle_hit", a: i, detail: String(k) });
    }
  }
}

/** Placings for the event (index order, best first). Field: best mark; races: finish time. */
export function placings(s: EventState): number[] {
  if (EVENTS[s.event].kind === "race") {
    const fin = s.athletes.map((a, i) => ({ a, i })).filter(({ a }) => a.finish !== null).sort((p, q) => p.a.finish! - q.a.finish!).map(({ i }) => i);
    const rest = s.athletes.map((a, i) => ({ a, i })).filter(({ a }) => a.finish === null).sort((p, q) => q.a.x - p.a.x).map(({ i }) => i);
    return [...fin, ...rest];
  }
  return s.athletes.map((a, i) => ({ m: a.finish ?? -1, i })).sort((p, q) => q.m - p.m).map(({ i }) => i);
}

export const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

/** AI athlete: taps at a skill-dependent cadence, sometimes misreads a prompt, times actions. */
export function aiEvent(s: EventState, i: number, skill: number, seq: number): InputEvent | null {
  const a = s.athletes[i]!;
  const memo = a as Athlete & { _ai?: { next: number; aimFrom: number; target: number } };
  memo._ai ??= { next: 0, aimFrom: -1, target: 0 };
  const ai = memo._ai;
  const t = s.t;
  if (s.phase !== "live" || a.phase === "done" || a.phase === "flight") return null;
  const r = hash(s.seed + i * 31, Math.floor(t * 60));
  if (a.phase === "aiming") {
    if (ai.aimFrom < 0) {
      ai.aimFrom = t;
      const ideal = s.event === "longjump" ? 42 : s.event === "polevault" ? PV.idealAngle : 37;
      ai.target = (ideal + (r - 0.5) * 18 * (1.2 - skill)) / (s.event === "longjump" ? 70 : s.event === "polevault" ? PV.rate : 75);
    }
    if (t - ai.aimFrom >= ai.target) {
      ai.aimFrom = -1;
      return { seq, key: "A", down: false };
    }
    return null;
  }
  // Actions.
  if (s.event === "hurdles110" && a.phase === "running") {
    const next = HURDLES.find((h, k) => !a.knocked.includes(k) && h > a.x);
    const lead = 1.35 + a.v * 0.13 + (r - 0.5) * 0.9 * (1.1 - skill);
    if (next !== undefined && next - a.x < lead && next - a.x > 0.5) return { seq, key: "A", down: true };
  }
  if (s.event === "longjump" && a.phase === "running" && a.x > -0.35 - (1 - skill) * 1.6 * r) return { seq, key: "A", down: true };
  if (s.event === "javelin" && a.phase === "running" && a.x > -4.2 - (1 - skill) * 3 * r) return { seq, key: "A", down: true };
  if (s.event === "polevault" && a.phase === "running" && a.x > PV.idealTakeoff - 0.4 - (1 - skill) * 2.4 * (r - 0.3)) return { seq, key: "A", down: true };
  if (t < ai.next) return null;
  // Cadence: ~6–11 taps per second with jitter; reaction to the gun.
  if (t < s.goAt + 0.14 + (1 - skill) * 0.12) return null;
  const rate = 6 + 5 * skill;
  ai.next = t + (1 / rate) * (0.85 + r * 0.3);
  const want = currentPrompt(s, i);
  const miss = r < 0.04 * (1.3 - skill);
  return { seq, key: miss ? (want === "L" ? "R" : "L") : want, down: true };
}

export function takeEventEvents(s: EventState): EventEvent[] {
  const e = s.events;
  s.events = [];
  return e;
}
