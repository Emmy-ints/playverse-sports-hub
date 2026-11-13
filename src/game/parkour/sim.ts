/**
 * Rooftop Rush — parkour race simulation (shared by the browser and the game server).
 *
 * Runners sprint automatically along a rooftop course three lanes wide. Players steer between
 * lanes and use contextual moves: JUMP gaps, VAULT vents and railings, CLIMB walls, GRAB swing
 * bars over wide gaps, SLIDE under pipes, and ROLL to absorb big drops. Everything is
 * deterministic for a seed and input sequence, so the server is authoritative while clients
 * predict their own runner instantly.
 *
 * Coordinates: runners move along +x (m). y is height (m). z is sideways; lanes 0..2 sit at
 * z = (lane - 1) * LANE_W.
 */

/** J = action (jump/vault/climb/grab), S = slide/roll, L/R = steer one lane. */
export type Key = "J" | "S" | "L" | "R";
export interface Input { seq: number; key: Key; down: boolean }

export type ObstacleKind = "vent" | "rail" | "pipe" | "gap" | "swing" | "wall" | "drop" | "pad";
export interface Obstacle {
  kind: ObstacleKind;
  /** Front edge (m). */
  x: number;
  /** Length along the course (m). */
  w: number;
  /** vent/rail: height; pipe: clearance underneath; wall/drop/gap/swing: height change (landing − take-off). */
  h: number;
  /** Roof height at the obstacle (m). */
  y: number;
  /** Lanes covered (bit 0 = lane 0 …). Gaps, swings, walls, drops and rails cover all lanes. */
  lanes: number;
}

export interface Segment { x0: number; x1: number; y: number }
export interface Course { seed: number; length: number; segments: Segment[]; obstacles: Obstacle[] }

export type RunnerState = "ready" | "run" | "air" | "slide" | "roll" | "stumble" | "climb" | "swing" | "fall" | "done";

export interface Runner {
  x: number;
  y: number;
  z: number;
  lane: number;
  vx: number;
  vy: number;
  state: RunnerState;
  /** End time of the current timed state. */
  until: number;
  jumpBuf: number;
  slideHeld: boolean;
  /** Roll pressed in the air: absorb the next big landing if it happens before this time. */
  rollArm: number;
  /** Highest point of the current airtime (for hard landings). */
  peakY: number;
  /** Taking off over a vent/rail: animate as a vault. */
  vaulting: boolean;
  boost: number;
  combo: number;
  bestCombo: number;
  hits: number;
  falls: number;
  passed: number[];
  checkpoint: number;
  checkpointY: number;
  /** Climb/swing path. */
  pathFrom: number;
  pathTo: number;
  pathY0: number;
  pathY1: number;
  pathDur: number;
  stride: number;
  airT: number;
  finish: number | null;
  lastSeq: number;
  failK: number;
  failN: number;
  /** AI: decided lane for the obstacle it is handling (-1 none) and which obstacle. */
  aiLane: number;
  aiFor: number;
}

export type ParkourEventKind = "go" | "jump" | "vault" | "land" | "slide" | "roll" | "perfect" | "hit" | "climb" | "grab" | "fall" | "respawn" | "pad" | "lane" | "finish" | "step";
export interface ParkourEvent { t: number; kind: ParkourEventKind; a?: number; detail?: string }

export interface RaceState {
  t: number;
  goAt: number;
  phase: "ready" | "live" | "over";
  course: Course;
  runners: Runner[];
  order: number[];
  overAt: number;
  events: ParkourEvent[];
}

export const LANES = 3;
export const LANE_W = 1.8;
export const RUN_SPEED = 8.4;
export const SLIDE_SPEED = 7.6;
const ACCEL = 5.5;
const GRAVITY = 21;
const JUMP_V = 6.6;
const JUMP_BUFFER = 0.14;
const SLIDE_MIN = 0.42;
const SLIDE_MAX = 1.0;
const STAND_H = 1.75;
const SLIDE_H = 0.75;
const STRAFE = 9;
/** Falls from this high (m above landing) need a roll. */
export const HARD_LANDING = 1.8;
const ROLL_WINDOW = 0.45;
const COUNTDOWN = 3;
const DT = 1 / 120;

export const LENGTHS = { sprint: 220, standard: 320, marathon: 460 } as const;
export type CourseLength = keyof typeof LENGTHS;

export const laneZ = (lane: number) => (lane - 1) * LANE_W;

function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash → [0,1), so AI decisions match on server and clients. */
export function hash01(a: number, b: number, c: number) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const ALL = 0b111;
const MASKS_1_2 = [0b001, 0b010, 0b100, 0b011, 0b110, 0b101];

export function createCourse(seed: number, length: CourseLength | number = "standard"): Course {
  const L = typeof length === "number" ? length : LENGTHS[length];
  const r = rng(seed);
  const segments: Segment[] = [];
  const obstacles: Obstacle[] = [];
  let level = 0; // roof levels 0..2
  const Y = (l: number) => l * 2.2;
  let segStart = -30;
  let x = 26;
  let last: string | null = null;
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)]!;
  while (x < L - 24) {
    const roll = r();
    let kind: string;
    if (roll < 0.17) kind = "vent";
    else if (roll < 0.31) kind = "pipe";
    else if (roll < 0.43) kind = "choice"; // vent in some lanes, pipe in the others
    else if (roll < 0.57) kind = "gap";
    else if (roll < 0.64) kind = "swing";
    else if (roll < 0.72) kind = "rail";
    else if (roll < 0.82) kind = level < 2 ? "wall" : "drop";
    else if (roll < 0.9) kind = level > 0 ? "drop" : "wall";
    else kind = "pad";
    if (kind === last && (kind === "pad" || kind === "wall" || kind === "drop" || kind === "swing")) kind = "vent";
    const y = Y(level);
    switch (kind) {
      case "vent":
        obstacles.push({ kind: "vent", x, w: 0.7 + r() * 0.5, h: 0.85 + r() * 0.25, y, lanes: pick(MASKS_1_2.concat([ALL])) });
        break;
      case "rail":
        obstacles.push({ kind: "rail", x, w: 0.25, h: 1.0, y, lanes: ALL });
        break;
      case "pipe":
        obstacles.push({ kind: "pipe", x, w: 0.6 + r() * 0.9, h: 1.05, y, lanes: pick([ALL, ALL, 0b011, 0b110, 0b001, 0b100]) });
        break;
      case "choice": {
        const ventMask = pick(MASKS_1_2);
        obstacles.push({ kind: "vent", x, w: 0.9, h: 0.95, y, lanes: ventMask });
        obstacles.push({ kind: "pipe", x, w: 0.9, h: 1.05, y, lanes: ALL & ~ventMask });
        break;
      }
      case "pad":
        obstacles.push({ kind: "pad", x, w: 2.4, h: 0, y, lanes: pick([0b001, 0b010, 0b100]) });
        break;
      case "gap":
      case "swing": {
        const swing = kind === "swing";
        const w = swing ? 6.2 + r() * 1.3 : 2.4 + r() * 1.7;
        const down = level > 0 && r() < 0.35;
        segments.push({ x0: segStart, x1: x, y });
        if (down) level--;
        obstacles.push({ kind: swing ? "swing" : "gap", x, w, h: Y(level) - y, y, lanes: ALL });
        segStart = x + w;
        x += w;
        break;
      }
      case "wall":
        segments.push({ x0: segStart, x1: x, y });
        level++;
        obstacles.push({ kind: "wall", x, w: 0, h: Y(level) - y, y, lanes: ALL });
        segStart = x;
        break;
      case "drop":
        segments.push({ x0: segStart, x1: x, y });
        level--;
        obstacles.push({ kind: "drop", x, w: 0, h: Y(level) - y, y, lanes: ALL });
        segStart = x;
        break;
    }
    last = kind;
    x += 12 + r() * 7;
  }
  segments.push({ x0: segStart, x1: L + 40, y: Y(level) });
  return { seed, length: L, segments, obstacles };
}

export function groundAt(c: Course, x: number): number | null {
  for (const s of c.segments) if (x >= s.x0 && x <= s.x1) return s.y;
  return null;
}

function newRunner(): Runner {
  return {
    x: 0, y: 0, z: 0, lane: 1, vx: 0, vy: 0, state: "ready", until: 0, jumpBuf: -1, slideHeld: false, rollArm: -1, peakY: 0, vaulting: false,
    boost: 0, combo: 0, bestCombo: 0, hits: 0, falls: 0, passed: [], checkpoint: 0, checkpointY: 0,
    pathFrom: 0, pathTo: 0, pathY0: 0, pathY1: 0, pathDur: 0, stride: 0, airT: 0, finish: null, lastSeq: -1, failK: -1, failN: 0, aiLane: -1, aiFor: -1,
  };
}

export function createRace(count: number, seed: number, length: CourseLength | number = "standard"): RaceState {
  // Spread the field across the lanes at the start (player 1 in the middle).
  const runners = Array.from({ length: count }, (_, i) => {
    const r = newRunner();
    r.lane = [1, 0, 2, 1, 0, 2][i % 6]!;
    r.z = laneZ(r.lane);
    return r;
  });
  return { t: 0, goAt: COUNTDOWN, phase: "ready", course: createCourse(seed, length), runners, order: [], overAt: 0, events: [] };
}

/** Lanes the runner's body currently overlaps (bit mask). */
export function laneMask(a: Runner) {
  let m = 0;
  for (let k = 0; k < LANES; k++) if (Math.abs(a.z - laneZ(k)) < 1.05) m |= 1 << k;
  return m;
}

/** Apply one input to runner i. Inputs with an old sequence number are ignored. */
export function applyInput(s: RaceState, i: number, inp: Input) {
  const a = s.runners[i];
  if (!a || inp.seq <= a.lastSeq) return;
  if (inp.key !== "J" && inp.key !== "S" && inp.key !== "L" && inp.key !== "R") return;
  a.lastSeq = inp.seq;
  if (inp.key === "S") a.slideHeld = inp.down;
  if (a.state === "done" || s.phase !== "live" || !inp.down) return;
  switch (inp.key) {
    case "J":
      a.jumpBuf = s.t + JUMP_BUFFER;
      // Grab a swing bar while already in the air near it.
      if (a.state === "air") tryGrab(s, i, a);
      break;
    case "S":
      if (a.state === "run") startSlide(s, i, a);
      else if (a.state === "air") {
        a.rollArm = s.t + ROLL_WINDOW;
        if (a.vy > -12) a.vy = Math.min(a.vy, -6); // tuck and drop
      }
      break;
    case "L":
    case "R": {
      if (a.state === "climb" || a.state === "swing" || a.state === "fall") return;
      const to = Math.max(0, Math.min(LANES - 1, a.lane + (inp.key === "L" ? -1 : 1)));
      if (to !== a.lane) {
        a.lane = to;
        s.events.push({ t: s.t, kind: "lane", a: i });
      }
      break;
    }
  }
}

function startSlide(s: RaceState, i: number, a: Runner) {
  a.state = "slide";
  a.until = s.t + SLIDE_MIN;
  s.events.push({ t: s.t, kind: "slide", a: i });
}

function height(a: Runner) {
  return a.state === "slide" || a.state === "roll" ? SLIDE_H : a.state === "air" ? 1.35 : STAND_H;
}

function hit(s: RaceState, i: number, a: Runner, what: string) {
  a.vx *= what === "landing" ? 0.55 : 0.35;
  a.boost = 0;
  a.combo = 0;
  a.hits++;
  a.state = "stumble";
  a.vy = Math.min(a.vy, 0);
  a.until = s.t + (what === "landing" ? 0.35 : 0.5);
  s.events.push({ t: s.t, kind: "hit", a: i, detail: what });
}

function clean(s: RaceState, i: number, a: Runner, k: number, kind: ObstacleKind, perfect: boolean) {
  a.passed.push(k);
  a.combo++;
  a.bestCombo = Math.max(a.bestCombo, a.combo);
  if (perfect) {
    a.boost = Math.min(2.6, a.boost + 0.9);
    s.events.push({ t: s.t, kind: "perfect", a: i, detail: kind });
  }
}

function underPipe(c: Course, a: Runner) {
  const m = laneMask(a);
  return c.obstacles.some((o) => o.kind === "pipe" && (o.lanes & m) && a.x + 0.3 > o.x && a.x - 0.3 < o.x + o.w);
}

/** Grab the bar at the near edge of a swing gap: from the ground just before it, or in the air. */
function tryGrab(s: RaceState, i: number, a: Runner): boolean {
  const c = s.course;
  for (let k = 0; k < c.obstacles.length; k++) {
    const o = c.obstacles[k]!;
    if (o.kind !== "swing" || a.passed.includes(k)) continue;
    const d = o.x - a.x;
    const reach = a.state === "air" ? d < 1.4 && d > -1.6 && a.y > o.y - 0.4 : d < 2.4 && d > -0.3;
    if (!reach) continue;
    a.passed.push(k);
    a.combo++;
    a.bestCombo = Math.max(a.bestCombo, a.combo);
    a.state = "swing";
    a.pathFrom = Math.min(a.x, o.x + 0.2);
    a.pathTo = o.x + o.w + 0.6;
    a.pathY0 = a.y;
    a.pathY1 = o.y + o.h;
    a.pathDur = 0.55 + o.w * 0.045;
    a.until = s.t + a.pathDur;
    a.vy = 0;
    a.jumpBuf = -1;
    a.vaulting = false;
    s.events.push({ t: s.t, kind: "grab", a: i });
    // A clean early grab from a run is the stylish one.
    if (d > 0.4 && d < 1.8) {
      a.boost = Math.min(2.6, a.boost + 0.9);
      s.events.push({ t: s.t, kind: "perfect", a: i, detail: "swing" });
    }
    return true;
  }
  return false;
}

function stepRunner(s: RaceState, i: number, a: Runner, dt: number) {
  const c = s.course;
  // Steering toward the chosen lane (also in the air).
  const tz = laneZ(a.lane);
  if (a.state !== "climb" && a.state !== "swing" && a.state !== "fall") a.z += Math.sign(tz - a.z) * Math.min(Math.abs(tz - a.z), STRAFE * dt);

  if (a.state === "done") {
    a.vx = Math.max(0, a.vx - 6 * dt);
    a.x += a.vx * dt;
    a.stride += a.vx * dt * 1.3;
    return;
  }
  if (a.state === "fall") {
    a.vy -= GRAVITY * dt;
    a.y += a.vy * dt;
    a.x += a.vx * 0.3 * dt;
    if (s.t >= a.until) {
      a.state = "run";
      a.x = a.checkpoint;
      a.y = a.checkpointY;
      a.vx = 5;
      a.vy = 0;
      a.boost = 0;
      a.jumpBuf = -1;
      a.slideHeld = false;
      a.rollArm = -1;
      s.events.push({ t: s.t, kind: "respawn", a: i });
    }
    return;
  }
  if (a.state === "climb" || a.state === "swing") {
    const k = Math.min(1, 1 - (a.until - s.t) / a.pathDur);
    a.x = a.pathFrom + (a.pathTo - a.pathFrom) * k;
    if (a.state === "climb") a.y = a.pathY0 + (a.pathY1 - a.pathY0) * Math.min(1, k * 1.4);
    else a.y = a.pathY0 + (a.pathY1 - a.pathY0) * k - Math.sin(k * Math.PI) * 1.4 + 0.3 * Math.sin(k * Math.PI * 0.5);
    a.stride += dt * 6;
    if (s.t >= a.until) {
      a.x = a.pathTo;
      a.y = a.pathY1;
      if (a.state === "swing") {
        // Fly off the bar into a run.
        a.vx = Math.max(a.vx, RUN_SPEED) + 0.6;
        a.boost = Math.min(2.6, a.boost + 0.6);
        s.events.push({ t: s.t, kind: "land", a: i, detail: "0.6" });
      } else a.vx = Math.max(a.vx, 4.5);
      a.state = "run";
    }
    return;
  }

  const onGround = a.state === "run" || a.state === "slide" || a.state === "roll" || a.state === "stumble";
  a.boost = Math.max(0, a.boost - dt * 0.9);
  if (onGround) {
    const target = (a.state === "slide" ? SLIDE_SPEED : a.state === "stumble" ? 2.5 : RUN_SPEED) + a.boost;
    a.vx += Math.sign(target - a.vx) * Math.min(Math.abs(target - a.vx), (target > a.vx ? ACCEL : 9) * dt);
  }
  if ((a.state === "stumble" || a.state === "roll") && s.t >= a.until) a.state = "run";
  if (a.state === "slide" && s.t >= a.until && (!a.slideHeld || s.t >= a.until + (SLIDE_MAX - SLIDE_MIN)) && !underPipe(c, a)) a.state = "run";
  if (a.state === "run" && a.slideHeld && a.until < s.t - 0.2 && !underPipe(c, a)) startSlide(s, i, a);

  // Action (buffered): grab a swing bar if one is in reach, otherwise jump/vault.
  if ((a.state === "run" || a.state === "slide") && a.jumpBuf >= s.t && !underPipe(c, a)) {
    a.jumpBuf = -1;
    if (!tryGrab(s, i, a)) {
      const m = laneMask(a);
      const vault = c.obstacles.some((o, k) => (o.kind === "vent" || o.kind === "rail") && (o.lanes & m) && !a.passed.includes(k) && o.x - a.x < 3 && o.x - a.x > -0.3);
      a.state = "air";
      a.vy = JUMP_V;
      a.airT = 0;
      a.peakY = a.y;
      a.until = 0;
      a.vaulting = vault;
      s.events.push({ t: s.t, kind: vault ? "vault" : "jump", a: i });
    }
    return;
  }

  const nx = a.x + a.vx * dt;
  // Walls: a building face to climb.
  for (let k = 0; k < c.obstacles.length; k++) {
    const o = c.obstacles[k]!;
    if (o.kind !== "wall") continue;
    const top = o.y + o.h;
    if (a.x <= o.x - 0.3 && nx > o.x - 0.3 && a.y < top - 0.02) {
      if (!a.passed.includes(k)) {
        a.passed.push(k);
        const reach = a.y - o.y;
        if (a.state === "air" && reach >= 0.35) {
          a.combo++;
          a.bestCombo = Math.max(a.bestCombo, a.combo);
          beginClimb(s, i, a, o, 0.32);
          if (reach > 0.9) {
            a.boost = Math.min(2.6, a.boost + 0.7);
            s.events.push({ t: s.t, kind: "perfect", a: i, detail: "wall" });
          }
        } else {
          hit(s, i, a, "wall");
          beginClimb(s, i, a, o, 1.0);
        }
      } else beginClimb(s, i, a, o, 0.9);
      return;
    }
  }
  a.x = nx;
  a.stride += a.vx * dt * 1.3;

  const g = groundAt(c, a.x);
  if (a.state === "air") {
    a.airT += dt;
    a.vy -= GRAVITY * dt;
    a.y += a.vy * dt;
    a.peakY = Math.max(a.peakY, a.y);
    if (g !== null && a.y <= g && a.vy <= 0) {
      const dropH = a.peakY - g;
      a.y = g;
      a.vy = 0;
      a.vaulting = false;
      if (dropH >= HARD_LANDING) {
        if (a.rollArm >= s.t - 0.06) {
          a.state = "roll";
          a.until = s.t + 0.4;
          a.rollArm = -1;
          a.boost = Math.min(2.6, a.boost + 0.5);
          s.events.push({ t: s.t, kind: "roll", a: i });
          s.events.push({ t: s.t, kind: "perfect", a: i, detail: "roll" });
        } else {
          a.state = "run";
          s.events.push({ t: s.t, kind: "land", a: i, detail: "1" });
          hit(s, i, a, "landing");
        }
      } else {
        a.state = a.slideHeld ? "slide" : "run";
        if (a.state === "slide") a.until = s.t + SLIDE_MIN;
        s.events.push({ t: s.t, kind: "land", a: i, detail: a.airT.toFixed(2) });
      }
    }
  } else if (g === null || g < a.y - 0.05) {
    // Ran off an edge (gap or drop).
    a.state = "air";
    a.airT = 0;
    a.vy = 0;
    a.peakY = a.y;
  } else a.y = g;

  // Fell into a gap.
  if (a.state === "air" && g === null) {
    const gap = c.obstacles.find((o) => (o.kind === "gap" || o.kind === "swing") && a.x > o.x - 1 && a.x < o.x + o.w + 1);
    if (gap && a.y < Math.min(gap.y, gap.y + gap.h) - 0.6) {
      a.state = "fall";
      a.falls++;
      a.combo = 0;
      a.boost = 0;
      a.until = s.t + 1.1;
      const k = c.obstacles.indexOf(gap);
      a.failN = a.failK === k ? a.failN + 1 : 1;
      a.failK = k;
      if (a.failN >= 3) {
        // Third miss in a row: put them across so nobody gets stuck (they've lost the time anyway).
        a.checkpoint = gap.x + gap.w + 1;
        a.checkpointY = gap.y + gap.h;
        a.failN = 0;
        if (!a.passed.includes(k)) a.passed.push(k);
      } else {
        a.checkpoint = gap.x - 9;
        a.checkpointY = groundAt(c, gap.x - 9) ?? gap.y;
        // Try the same gap (or swing bar) again.
        a.passed = a.passed.filter((p) => p !== k);
      }
      s.events.push({ t: s.t, kind: "fall", a: i, detail: gap.kind });
      return;
    }
  }

  // Obstacles in the runner's lanes.
  const m = laneMask(a);
  for (let k = 0; k < c.obstacles.length; k++) {
    const o = c.obstacles[k]!;
    if (a.passed.includes(k)) continue;
    if (o.kind === "vent" || o.kind === "rail") {
      if (a.x + 0.25 > o.x && a.x - 0.25 < o.x + o.w) {
        // Feet may brush the top (a hand-plant vault); clipping it lower is a trip.
        if ((o.lanes & m) && a.y < o.y + o.h - 0.35) {
          a.passed.push(k);
          hit(s, i, a, o.kind);
        }
      } else if (a.x - 0.25 >= o.x + o.w) {
        if (o.lanes & m || a.state === "air") {
          const takeoff = a.airT * a.vx - (o.w + 0.5);
          clean(s, i, a, k, o.kind, a.state === "air" && takeoff < 1.6);
        } else a.passed.push(k); // went round it
      }
    } else if (o.kind === "pipe") {
      if (a.x + 0.25 > o.x && a.x - 0.25 < o.x + o.w) {
        if ((o.lanes & m) && a.y + height(a) > o.y + o.h) {
          a.passed.push(k);
          hit(s, i, a, "pipe");
        }
      } else if (a.x - 0.25 >= o.x + o.w) {
        if (o.lanes & m) clean(s, i, a, k, "pipe", a.state === "slide" && s.t - (a.until - SLIDE_MIN) < 0.5);
        else a.passed.push(k);
      }
    } else if (o.kind === "gap") {
      if (a.x > o.x + o.w + 0.3 && (a.state === "run" || a.state === "slide" || a.state === "roll")) clean(s, i, a, k, "gap", a.x < o.x + o.w + 1.4);
    } else if (o.kind === "pad") {
      if (a.x > o.x && a.x < o.x + o.w && a.y - o.y < 0.4 && (o.lanes & m)) {
        a.passed.push(k);
        a.boost = Math.min(3.2, a.boost + 2.6);
        s.events.push({ t: s.t, kind: "pad", a: i });
      } else if (a.x > o.x + o.w) a.passed.push(k);
    } else if (o.kind === "drop") {
      if (a.x > o.x + 0.5) a.passed.push(k);
    }
  }

  if (a.x >= c.length && a.finish === null) {
    a.finish = Math.round((s.t - s.goAt) * 1000) / 1000;
    if (!s.order.includes(i)) s.order.push(i);
    s.events.push({ t: s.t, kind: "finish", a: i, detail: a.finish.toFixed(3) });
  }
  if (a.finish !== null && a.state !== "air") a.state = "done";
}

function beginClimb(s: RaceState, i: number, a: Runner, o: Obstacle, dur: number) {
  a.state = "climb";
  a.pathFrom = Math.min(a.x, o.x - 0.3);
  a.pathTo = o.x + 0.45;
  a.pathY0 = a.y;
  a.pathY1 = o.y + o.h;
  a.pathDur = dur;
  a.until = s.t + dur;
  a.vy = 0;
  a.vaulting = false;
  a.x = a.pathFrom;
  s.events.push({ t: s.t, kind: "climb", a: i, detail: dur < 0.5 ? "fast" : "slow" });
}

export function stepRace(s: RaceState, dt: number) {
  let left = Math.min(dt, 0.25);
  while (left > 1e-6) {
    const h = Math.min(DT, left);
    left -= h;
    s.t += h;
    if (s.phase === "ready") {
      if (s.t >= s.goAt) {
        s.phase = "live";
        s.runners.forEach((r) => (r.state = "run"));
        s.events.push({ t: s.t, kind: "go" });
      }
      continue;
    }
    if (s.phase === "over") {
      s.runners.forEach((r, i) => stepRunner(s, i, r, h));
      continue;
    }
    s.runners.forEach((r, i) => {
      const prev = Math.floor(r.stride / Math.PI);
      stepRunner(s, i, r, h);
      if (r.state === "run" && Math.floor(r.stride / Math.PI) !== prev) s.events.push({ t: s.t, kind: "step", a: i });
    });
    const all = s.order.length === s.runners.length;
    const lead = s.order.length ? s.runners[s.order[0]!]!.finish ?? 0 : 0;
    if (all || (s.order.length > 0 && s.t - s.goAt > lead + 25)) {
      s.phase = "over";
      s.overAt = s.t;
      s.runners
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.finish === null)
        .sort((p, q) => q.r.x - p.r.x)
        .forEach(({ i }) => s.order.includes(i) || s.order.push(i));
    }
  }
}

export function takeEvents(s: RaceState): ParkourEvent[] {
  const e = s.events;
  s.events = [];
  return e;
}

export function placings(s: RaceState): number[] {
  if (s.phase === "over") return [...s.order];
  const done = [...s.order];
  const rest = s.runners.map((_, i) => i).filter((i) => !done.includes(i)).sort((a, b) => s.runners[b]!.x - s.runners[a]!.x);
  return [...done, ...rest];
}

/** What the runner should do next: the move the HUD shows, for the obstacle ahead in their lanes. */
export type MoveHint = "jump" | "vault" | "climb" | "grab" | "slide" | "roll";
export interface NextMove { o: Obstacle; k: number; dist: number; move: MoveHint; /** Lanes that are clear (for vents/pipes). */ free: number }

export function nextMove(s: RaceState, a: Runner): NextMove | null {
  if (a.state === "air" && a.vy < 0) {
    const g = groundAt(s.course, a.x + a.vx * 0.25);
    if (g !== null && a.peakY - g >= HARD_LANDING) {
      const drop = s.course.obstacles.find((o) => (o.kind === "drop" || o.kind === "gap" || o.kind === "swing") && o.x < a.x + 1 && o.x + o.w + 3 > a.x);
      if (drop) return { o: drop, k: s.course.obstacles.indexOf(drop), dist: 0, move: "roll", free: 0 };
    }
  }
  const m = laneMask(a);
  const obs = s.course.obstacles;
  for (let k = 0; k < obs.length; k++) {
    const o = obs[k]!;
    if (o.kind === "pad" || a.passed.includes(k)) continue;
    const d = o.x - a.x;
    if (d < -0.5) continue;
    if (o.kind === "drop") return { o, k, dist: d, move: "roll", free: 0 };
    if ((o.kind === "vent" || o.kind === "pipe") && !(o.lanes & (1 << a.lane)) && !(o.lanes & m)) continue;
    const free = ALL & ~obs.filter((p) => Math.abs(p.x - o.x) < 0.5 && (p.kind === "vent" || p.kind === "pipe")).reduce((acc, p) => acc | p.lanes, 0);
    const move: MoveHint = o.kind === "pipe" ? "slide" : o.kind === "vent" || o.kind === "rail" ? "vault" : o.kind === "wall" ? "climb" : o.kind === "swing" ? "grab" : "jump";
    return { o, k, dist: d, move, free };
  }
  return null;
}

/**
 * Computer runner: steers around obstacles or takes them on, times its moves with an accuracy
 * set by `skill` (0..1). Decisions come from a deterministic hash, so server and clients agree.
 */
export function aiInput(s: RaceState, i: number, skill: number, seq: number): Input | null {
  const a = s.runners[i];
  if (!a || s.phase !== "live" || a.state === "done" || a.state === "fall" || a.state === "climb" || a.state === "swing") return null;
  const c = s.course;
  const v = Math.max(3, a.vx);
  // Big landing coming: roll (skilled runners usually do).
  if (a.state === "air" && a.vy < -1) {
    const g = groundAt(c, a.x + a.vx * 0.2);
    if (g !== null && a.peakY - g >= HARD_LANDING && a.rollArm < s.t && a.y - g < 1.3 && hash01(c.seed, i, Math.floor(a.x)) < 0.35 + skill * 0.6) return { seq, key: "S", down: true };
  }

  // Next obstacle that matters for this runner's lane(s) (pads handled separately).
  const myLanes = laneMask(a) | (1 << a.lane);
  let n: { o: Obstacle; k: number; dist: number } | null = null;
  for (let k = 0; k < c.obstacles.length; k++) {
    const o = c.obstacles[k]!;
    if (a.passed.includes(k) || o.kind === "drop" || o.kind === "pad") continue;
    const d = o.x - a.x;
    if (d < -0.5) continue;
    if ((o.kind === "vent" || o.kind === "pipe") && !(o.lanes & myLanes)) continue;
    n = { o, k, dist: d };
    break;
  }
  // Let go of slide once clear of the pipe.
  if (a.slideHeld && !(n && n.o.kind === "pipe" && n.dist < 2.5)) return { seq, key: "S", down: false };
  // Lane choice: dodge a vent/pipe in our lane (if a clear lane exists), or chase a speed pad.
  if (n && (n.o.kind === "vent" || n.o.kind === "pipe") && a.aiFor !== n.k && n.dist < 22) {
    a.aiFor = n.k;
    a.aiLane = -1;
    const o = n.o;
    const blocked = c.obstacles.filter((p) => Math.abs(p.x - o.x) < 0.5 && (p.kind === "vent" || p.kind === "pipe")).reduce((acc, p) => acc | p.lanes, 0);
    if (hash01(c.seed, i * 7 + 3, n.k) < 0.25 + skill * 0.45) {
      const options = [0, 1, 2].filter((l) => !(blocked & (1 << l))).sort((p, q) => Math.abs(p - a.lane) - Math.abs(q - a.lane));
      if (options.length && Math.abs(options[0]! - a.lane) <= 1 + Math.round(skill)) a.aiLane = options[0]!;
    }
  }
  const pad = c.obstacles.findIndex((o, k) => o.kind === "pad" && !a.passed.includes(k) && o.x - a.x > 4 && o.x - a.x < 22);
  if (pad >= 0 && a.aiFor !== pad && (!n || n.o.x > c.obstacles[pad]!.x + 4) && hash01(c.seed, i * 11 + 5, pad) < 0.3 + skill * 0.5) {
    a.aiFor = pad;
    a.aiLane = Math.round(Math.log2(c.obstacles[pad]!.lanes));
  }
  if (a.aiLane >= 0 && a.aiLane !== a.lane && Math.abs(a.z - laneZ(a.lane)) < 0.3) return { seq, key: a.aiLane < a.lane ? "L" : "R", down: true };
  if (!n) return null;
  const { o, dist } = n;
  const noise = (hash01(c.seed, i, n.k + a.falls * 101 + a.hits * 31) - 0.5) * 2 * (1 - skill);
  const inMyLane = (o.lanes & laneMask(a)) !== 0;
  if (o.kind === "pipe") {
    if (!inMyLane) return null;
    const at = 1.4 + noise * 1.6;
    if (!a.slideHeld && dist < at * (v / RUN_SPEED) && dist > -0.2 && a.state === "run") return { seq, key: "S", down: true };
    return null;
  }
  if (o.kind === "vent" && !inMyLane) return null;
  if (a.state !== "run") return null;
  const ideal = o.kind === "vent" || o.kind === "rail" ? 1.7 : o.kind === "gap" ? 0.5 : o.kind === "swing" ? 1.1 : 1.7;
  const at = ideal + noise * (o.kind === "gap" || o.kind === "swing" ? 1.3 : 1.8);
  if (dist < at * (v / RUN_SPEED) + 0.05) return { seq, key: "J", down: true };
  return null;
}

export function progress(s: RaceState, i: number) {
  const a = s.runners[i];
  return a ? Math.max(0, Math.min(1, a.x / s.course.length)) : 0;
}
