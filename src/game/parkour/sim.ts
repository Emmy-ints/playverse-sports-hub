/**
 * Rooftop Rush — parkour race simulation (shared by the browser and the game server).
 *
 * Runners race side by side across the same rooftop course: vault vents (jump), slide under pipes
 * and signs, leap the gaps between buildings, climb up to higher roofs and drop down to lower ones,
 * and hit speed pads. Everything is deterministic for a given seed and input sequence, so the
 * server can be authoritative while clients predict their own runner instantly.
 *
 * Coordinates: runners move along +x (metres). y is height (m). Each runner has its own lane (z).
 */

export type Key = "J" | "S";
export interface Input { seq: number; key: Key; down: boolean }

export type ObstacleKind = "vent" | "pipe" | "gap" | "wall" | "drop" | "pad";
export interface Obstacle {
  kind: ObstacleKind;
  /** Front edge (m). */
  x: number;
  /** Length along the course (m). */
  w: number;
  /** vent: height; pipe: clearance underneath; wall/drop: height change; gap: 0. */
  h: number;
  /** Roof height at the obstacle (m). */
  y: number;
}

export interface Segment { x0: number; x1: number; y: number }

export interface Course { seed: number; length: number; segments: Segment[]; obstacles: Obstacle[] }

export type RunnerState = "ready" | "run" | "air" | "slide" | "stumble" | "climb" | "fall" | "done";

export interface Runner {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: RunnerState;
  /** Time the current timed state (slide/stumble/climb/fall) ends. */
  until: number;
  /** Jump pressed recently (buffer until this time). */
  jumpBuf: number;
  slideHeld: boolean;
  /** Extra speed from pads/perfect vaults, decays. */
  boost: number;
  /** Clean obstacles in a row. */
  combo: number;
  bestCombo: number;
  hits: number;
  falls: number;
  /** Obstacles already resolved by this runner (index), so each counts once. */
  passed: number[];
  /** Where to respawn after a fall. */
  checkpoint: number;
  checkpointY: number;
  /** Climb animation: start/end positions. */
  climbFrom: number;
  climbTo: number;
  climbY0: number;
  climbY1: number;
  climbDur: number;
  stride: number;
  airT: number;
  finish: number | null;
  lastSeq: number;
  /** AI: index of the next obstacle it has planned for. */
  aiNext: number;
  /** Gap the runner last fell into and how many times in a row. */
  failK: number;
  failN: number;
}

export type ParkourEventKind = "go" | "jump" | "land" | "slide" | "vault" | "perfect" | "hit" | "climb" | "fall" | "respawn" | "pad" | "finish" | "step";
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
const COUNTDOWN = 3;
const DT = 1 / 120;

export const LENGTHS = { sprint: 220, standard: 320, marathon: 460 } as const;
export type CourseLength = keyof typeof LENGTHS;

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

/** Deterministic hash → [0,1), used so AI decisions match on server and clients. */
function hash01(a: number, b: number, c: number) {
  let h = (a * 374761393 + b * 668265263 + c * 2147483647) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function createCourse(seed: number, length: CourseLength | number = "standard"): Course {
  const L = typeof length === "number" ? length : LENGTHS[length];
  const r = rng(seed);
  const segments: Segment[] = [];
  const obstacles: Obstacle[] = [];
  let level = 0; // 0..2 roof levels
  const Y = (l: number) => l * 2.2;
  let segStart = -30;
  let x = 26;
  let lastKind: ObstacleKind | null = null;
  while (x < L - 22) {
    const roll = r();
    let kind: ObstacleKind;
    if (roll < 0.26) kind = "vent";
    else if (roll < 0.46) kind = "pipe";
    else if (roll < 0.66) kind = "gap";
    else if (roll < 0.78) kind = level < 2 ? "wall" : "drop";
    else if (roll < 0.88) kind = level > 0 ? "drop" : "wall";
    else kind = "pad";
    // Avoid back-to-back pads and level changes; keep it readable.
    if (kind === lastKind && (kind === "pad" || kind === "wall" || kind === "drop")) kind = "vent";
    const y = Y(level);
    switch (kind) {
      case "vent":
        obstacles.push({ kind, x, w: 0.7 + r() * 0.5, h: 0.85 + r() * 0.25, y });
        break;
      case "pipe":
        obstacles.push({ kind, x, w: 0.6 + r() * 0.9, h: 1.05, y });
        break;
      case "pad":
        obstacles.push({ kind, x, w: 2.4, h: 0, y });
        break;
      case "gap": {
        const w = 2.4 + r() * 1.7;
        const down = level > 0 && r() < 0.35;
        segments.push({ x0: segStart, x1: x, y });
        if (down) level--;
        obstacles.push({ kind, x, w, h: Y(level) - y, y });
        segStart = x + w;
        x += w;
        break;
      }
      case "wall": {
        segments.push({ x0: segStart, x1: x, y });
        level++;
        obstacles.push({ kind, x, w: 0, h: Y(level) - y, y });
        segStart = x;
        break;
      }
      case "drop": {
        segments.push({ x0: segStart, x1: x, y });
        level--;
        obstacles.push({ kind, x, w: 0, h: Y(level) - y, y });
        segStart = x;
        break;
      }
    }
    lastKind = kind;
    x += 11 + r() * 7;
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
    x: 0, y: 0, vx: 0, vy: 0, state: "ready", until: 0, jumpBuf: -1, slideHeld: false, boost: 0, combo: 0, bestCombo: 0, hits: 0, falls: 0,
    passed: [], checkpoint: 0, checkpointY: 0, climbFrom: 0, climbTo: 0, climbY0: 0, climbY1: 0, climbDur: 0, stride: 0, airT: 0, finish: null, lastSeq: -1, aiNext: 0, failK: -1, failN: 0,
  };
}

export function createRace(count: number, seed: number, length: CourseLength | number = "standard"): RaceState {
  return {
    t: 0, goAt: COUNTDOWN, phase: "ready", course: createCourse(seed, length),
    runners: Array.from({ length: count }, newRunner), order: [], overAt: 0, events: [],
  };
}

/** Apply one input to runner i. Inputs with an old sequence number are ignored. */
export function applyInput(s: RaceState, i: number, inp: Input) {
  const a = s.runners[i];
  if (!a || inp.seq <= a.lastSeq) return;
  if (inp.key !== "J" && inp.key !== "S") return;
  a.lastSeq = inp.seq;
  if (a.state === "done" || s.phase !== "live") {
    if (inp.key === "S") a.slideHeld = inp.down;
    return;
  }
  if (inp.key === "J") {
    if (inp.down) a.jumpBuf = s.t + JUMP_BUFFER;
  } else {
    a.slideHeld = inp.down;
    if (inp.down) {
      if (a.state === "run") startSlide(s, i, a);
      else if (a.state === "air" && a.vy > -12) a.vy = -12; // fast-fall
    }
  }
}

function startSlide(s: RaceState, i: number, a: Runner) {
  a.state = "slide";
  a.until = s.t + SLIDE_MIN;
  s.events.push({ t: s.t, kind: "slide", a: i });
}

function height(a: Runner) {
  return a.state === "slide" ? SLIDE_H : a.state === "air" ? 1.35 : STAND_H;
}

function hit(s: RaceState, i: number, a: Runner, what: string) {
  a.vx *= 0.35;
  a.boost = 0;
  a.combo = 0;
  a.hits++;
  a.state = "stumble";
  a.vy = Math.min(a.vy, 0);
  a.until = s.t + 0.5;
  s.events.push({ t: s.t, kind: "hit", a: i, detail: what });
}

function clean(s: RaceState, i: number, a: Runner, k: number, kind: ObstacleKind, perfect: boolean) {
  a.passed.push(k);
  a.combo++;
  a.bestCombo = Math.max(a.bestCombo, a.combo);
  if (perfect) {
    a.boost = Math.min(2.6, a.boost + 0.9);
    s.events.push({ t: s.t, kind: "perfect", a: i, detail: kind });
  } else if (kind === "vent") {
    s.events.push({ t: s.t, kind: "vault", a: i });
  }
}

function stepRunner(s: RaceState, i: number, a: Runner, dt: number) {
  const c = s.course;
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
      s.events.push({ t: s.t, kind: "respawn", a: i });
    }
    return;
  }
  if (a.state === "climb") {
    const k = Math.min(1, 1 - (a.until - s.t) / a.climbDur);
    a.x = a.climbFrom + (a.climbTo - a.climbFrom) * k;
    a.y = a.climbY0 + (a.climbY1 - a.climbY0) * Math.min(1, k * 1.4);
    if (s.t >= a.until) {
      a.state = "run";
      a.y = a.climbY1;
      a.vx = Math.max(a.vx, 4.5);
    }
    return;
  }

  // Speed.
  const onGround = a.state === "run" || a.state === "slide" || a.state === "stumble";
  a.boost = Math.max(0, a.boost - dt * 0.9);
  if (onGround) {
    const target = (a.state === "slide" ? SLIDE_SPEED : a.state === "stumble" ? 2.5 : RUN_SPEED) + a.boost;
    a.vx += Math.sign(target - a.vx) * Math.min(Math.abs(target - a.vx), (target > a.vx ? ACCEL : 9) * dt);
  }
  if (a.state === "stumble" && s.t >= a.until) a.state = "run";
  if (a.state === "slide" && s.t >= a.until && (!a.slideHeld || s.t >= a.until + (SLIDE_MAX - SLIDE_MIN))) {
    // Can't stand up under a pipe.
    const under = c.obstacles.some((o) => o.kind === "pipe" && a.x + 0.3 > o.x && a.x - 0.3 < o.x + o.w);
    if (!under) a.state = "run";
  }
  if (a.state === "run" && a.slideHeld && a.until < s.t - 0.2) startSlide(s, i, a);

  // Jump (buffered).
  if ((a.state === "run" || a.state === "slide") && a.jumpBuf >= s.t) {
    const under = c.obstacles.some((o) => o.kind === "pipe" && a.x + 0.3 > o.x && a.x - 0.3 < o.x + o.w);
    if (!under) {
      a.jumpBuf = -1;
      a.state = "air";
      a.vy = JUMP_V;
      a.airT = 0;
      a.until = 0;
      s.events.push({ t: s.t, kind: "jump", a: i });
    }
  }

  const nx = a.x + a.vx * dt;
  // Walls: a building face to climb.
  for (let k = 0; k < c.obstacles.length; k++) {
    const o = c.obstacles[k]!;
    if (o.kind !== "wall") continue;
    const top = o.y + o.h;
    if (a.x <= o.x - 0.3 && nx > o.x - 0.3 && a.y < top - 0.02) {
      if (!a.passed.includes(k)) {
        const reach = a.y - o.y;
        if (a.state === "air" && reach >= 0.35) {
          // Good wall-run: quick climb, keep momentum.
          a.passed.push(k);
          a.combo++;
          a.bestCombo = Math.max(a.bestCombo, a.combo);
          beginClimb(s, i, a, o, 0.32);
          if (reach > 0.9) {
            a.boost = Math.min(2.6, a.boost + 0.7);
            s.events.push({ t: s.t, kind: "perfect", a: i, detail: "wall" });
          }
        } else {
          // Ran into it: bump, then a slow scramble up.
          a.passed.push(k);
          hit(s, i, a, "wall");
          beginClimb(s, i, a, o, 1.0);
        }
      } else {
        beginClimb(s, i, a, o, 0.9);
      }
      return;
    }
  }
  a.x = nx;
  a.stride += a.vx * dt * 1.3;

  // Vertical.
  const g = groundAt(c, a.x);
  if (a.state === "air") {
    a.airT += dt;
    a.vy -= GRAVITY * dt;
    a.y += a.vy * dt;
    if (g !== null && a.y <= g && a.vy <= 0) {
      a.y = g;
      a.vy = 0;
      a.state = a.slideHeld ? "slide" : "run";
      if (a.state === "slide") a.until = s.t + SLIDE_MIN;
      s.events.push({ t: s.t, kind: "land", a: i, detail: a.airT.toFixed(2) });
    }
  } else if (g === null || g < a.y - 0.05) {
    // Ran off an edge (gap or drop).
    a.state = "air";
    a.airT = 0;
    a.vy = 0;
  } else {
    a.y = g;
  }
  // Fell into a gap.
  if (a.state === "air" && g === null) {
    const gap = c.obstacles.find((o) => o.kind === "gap" && a.x > o.x - 1 && a.x < o.x + o.w + 1);
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
        // Third miss in a row: put them across, so nobody gets stuck (they've lost the time anyway).
        a.checkpoint = gap.x + gap.w + 1;
        a.checkpointY = gap.y + gap.h;
        a.failN = 0;
      } else {
        // Far enough back to get up to speed again.
        a.checkpoint = gap.x - 9;
        a.checkpointY = groundAt(c, gap.x - 9) ?? gap.y;
      }
      if (!a.passed.includes(k)) a.passed.push(k);
      s.events.push({ t: s.t, kind: "fall", a: i });
      return;
    }
  }

  // Obstacles under/over the runner.
  for (let k = 0; k < c.obstacles.length; k++) {
    const o = c.obstacles[k]!;
    if (a.passed.includes(k)) continue;
    if (o.kind === "vent") {
      if (a.x + 0.25 > o.x && a.x - 0.25 < o.x + o.w) {
        // Feet may brush the top (a hand-plant vault); clipping it lower is a trip.
        if (a.y < o.y + o.h - 0.35) {
          a.passed.push(k);
          hit(s, i, a, "vent");
        }
      } else if (a.x - 0.25 >= o.x + o.w) {
        // Perfect: took off close to the vent (late, committed vault).
        // Perfect: a late, committed take-off (within ~1.6 m of the vent).
        const takeoff = a.airT * a.vx - (o.w + 0.5);
        clean(s, i, a, k, "vent", a.state === "air" && takeoff < 1.6);
      }
    } else if (o.kind === "pipe") {
      if (a.x + 0.25 > o.x && a.x - 0.25 < o.x + o.w) {
        if (a.y + height(a) > o.y + o.h) {
          a.passed.push(k);
          hit(s, i, a, "pipe");
        }
      } else if (a.x - 0.25 >= o.x + o.w) {
        clean(s, i, a, k, "pipe", a.state === "slide" && s.t - (a.until - SLIDE_MIN) < 0.5);
      }
    } else if (o.kind === "gap") {
      if (a.x > o.x + o.w + 0.3 && (a.state === "run" || a.state === "slide")) {
        clean(s, i, a, k, "gap", a.x < o.x + o.w + 1.4);
      }
    } else if (o.kind === "pad") {
      if (a.x > o.x && a.x < o.x + o.w && a.y - o.y < 0.4) {
        a.passed.push(k);
        a.boost = Math.min(3.2, a.boost + 2.6);
        s.events.push({ t: s.t, kind: "pad", a: i });
      }
    } else if (o.kind === "drop") {
      if (a.x > o.x + 0.5) a.passed.push(k);
    }
  }

  if (a.x >= c.length && a.finish === null) {
    a.finish = Math.round((s.t - s.goAt) * 1000) / 1000;
    a.state = a.state === "air" ? "air" : "done";
    if (!s.order.includes(i)) s.order.push(i);
    s.events.push({ t: s.t, kind: "finish", a: i, detail: a.finish.toFixed(3) });
  }
  if (a.finish !== null && a.state !== "air") a.state = "done";
}

function beginClimb(s: RaceState, i: number, a: Runner, o: Obstacle, dur: number) {
  a.state = "climb";
  a.climbFrom = a.x;
  a.climbTo = o.x + 0.45;
  a.climbY0 = a.y;
  a.climbY1 = o.y + o.h;
  a.climbDur = dur;
  a.until = s.t + dur;
  a.vy = 0;
  a.x = Math.min(a.x, o.x - 0.3);
  s.events.push({ t: s.t, kind: "climb", a: i, detail: dur < 0.5 ? "fast" : "slow" });
}

export function stepRace(s: RaceState, dt: number) {
  let left = Math.min(dt, 0.25);
  while (left > 1e-6) {
    const h = Math.min(DT, left);
    left -= h;
    const before = s.t;
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
      const prevStride = Math.floor(r.stride / Math.PI);
      stepRunner(s, i, r, h);
      if ((r.state === "run") && Math.floor(r.stride / Math.PI) !== prevStride) s.events.push({ t: s.t, kind: "step", a: i });
    });
    void before;
    const all = s.order.length === s.runners.length;
    const lead = s.order.length ? s.runners[s.order[0]!]!.finish ?? 0 : 0;
    if (all || (s.order.length > 0 && s.t - s.goAt > lead + 25)) {
      s.phase = "over";
      s.overAt = s.t;
      // Anyone still out there is placed by distance.
      s.runners
        .map((r, i) => ({ r, i }))
        .filter(({ r }) => r.finish === null)
        .sort((p, q) => q.r.x - p.r.x)
        .forEach(({ i }) => s.order.push(i));
    }
  }
}

export function takeEvents(s: RaceState): ParkourEvent[] {
  const e = s.events;
  s.events = [];
  return e;
}

/** Final placing order (index of runners, best first). */
export function placings(s: RaceState): number[] {
  if (s.phase === "over") return [...s.order];
  const done = [...s.order];
  const rest = s.runners.map((_, i) => i).filter((i) => !done.includes(i)).sort((a, b) => s.runners[b]!.x - s.runners[a]!.x);
  return [...done, ...rest];
}

/** Next obstacle that needs an action from runner a, and its distance. */
export function nextObstacle(s: RaceState, a: Runner): { o: Obstacle; k: number; dist: number } | null {
  const obs = s.course.obstacles;
  for (let k = 0; k < obs.length; k++) {
    const o = obs[k]!;
    if (o.kind === "drop" || o.kind === "pad") continue;
    if (a.passed.includes(k)) continue;
    const d = o.x - a.x;
    if (d < -0.5) continue;
    return { o, k, dist: d };
  }
  return null;
}

/**
 * Computer runner: decides when to act on each obstacle. `skill` 0..1 controls timing accuracy.
 * Decisions come from a deterministic hash, so server and clients agree.
 */
export function aiInput(s: RaceState, i: number, skill: number, seq: number): Input | null {
  const a = s.runners[i];
  if (!a || s.phase !== "live" || a.state === "done" || a.state === "fall" || a.state === "climb") return null;
  if (a.slideHeld && a.state !== "slide" && a.state !== "air") return { seq, key: "S", down: false };
  const n = nextObstacle(s, a);
  if (!n) {
    if (a.slideHeld) return { seq, key: "S", down: false };
    return null;
  }
  const { o, k, dist } = n;
  const noise = (hash01(s.course.seed, i, k + a.falls * 101 + a.hits * 31) - 0.5) * 2 * (1 - skill);
  const v = Math.max(3, a.vx);
  if (o.kind === "pipe") {
    if (a.slideHeld && dist < -o.w) return { seq, key: "S", down: false };
    const at = 1.4 + noise * 1.6;
    if (!a.slideHeld && dist < at * (v / RUN_SPEED) && dist > -0.2 && a.state === "run") return { seq, key: "S", down: true };
    return null;
  }
  if (a.slideHeld) return { seq, key: "S", down: false };
  if (a.state !== "run") return null;
  // Take-off distance before the obstacle's front edge.
  const ideal = o.kind === "vent" ? 1.7 : o.kind === "gap" ? 0.5 : 1.7;
  const at = ideal + noise * (o.kind === "gap" ? 1.3 : 1.8);
  if (dist < at * (v / RUN_SPEED) + 0.05) return { seq, key: "J", down: true };
  return null;
}

/** Progress 0..1 along the course. */
export function progress(s: RaceState, i: number) {
  const a = s.runners[i];
  return a ? Math.max(0, Math.min(1, a.x / s.course.length)) : 0;
}
