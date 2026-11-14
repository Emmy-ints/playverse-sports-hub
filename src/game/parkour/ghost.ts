/**
 * Parkour ghost runs: your best time on a fixed-seed course, recorded on this device at 20 Hz and
 * replayed as a translucent runner. Only used on "Today's course" (same seed for everyone, all day).
 */
import type { Runner, RunnerState } from "./sim";

const STATES: RunnerState[] = ["ready", "run", "air", "slide", "roll", "stumble", "climb", "swing", "fall", "done"];
const N = 8; // x, y, z, state, vx, vy, stride, until-t

export interface ParkourGhost { v: 1; time: number; dt: number; p: number[] }
export type GhostPose = Pick<Runner, "x" | "y" | "z" | "state" | "vx" | "vy" | "stride" | "until" | "vaulting">;

const key = (id: string) => `pv.ghost.parkour.${id}`;

/** Seed shared by everyone for the current UTC day. */
export function dailySeed(d = new Date()) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

export function loadParkourGhost(id: string): ParkourGhost | null {
  try {
    const g = JSON.parse(localStorage.getItem(key(id)) ?? "null") as ParkourGhost | null;
    return g && g.v === 1 && Array.isArray(g.p) && g.p.length >= N * 2 ? g : null;
  } catch {
    return null;
  }
}

export function saveParkourGhost(id: string, g: ParkourGhost) {
  try {
    localStorage.setItem(key(id), JSON.stringify(g));
  } catch {
    /* optional */
  }
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export class ParkourGhostRecorder {
  private p: number[] = [];
  private next = 0;
  readonly dt = 0.05;
  sample(t: number, a: Runner) {
    while (t >= this.next) {
      this.p.push(r2(a.x), r2(a.y), r2(a.z), Math.max(0, STATES.indexOf(a.state)), r2(a.vx), r2(a.vy), r2(a.stride), r2(a.until - t));
      this.next += this.dt;
    }
  }
  finish(time: number): ParkourGhost | null {
    return this.p.length >= N * 20 ? { v: 1, time, dt: this.dt, p: this.p } : null;
  }
}

export function parkourGhostAt(g: ParkourGhost, t: number): GhostPose | null {
  const n = g.p.length / N;
  const f = t / g.dt;
  if (f < 0) return null;
  if (f >= n - 1) {
    const a = (n - 1) * N;
    return { x: g.p[a]!, y: g.p[a + 1]!, z: g.p[a + 2]!, state: "done", vx: 0, vy: 0, stride: 0, until: t, vaulting: false };
  }
  const i = Math.floor(f), k = f - i, a = i * N, b = a + N;
  const L = (o: number) => g.p[a + o]! + (g.p[b + o]! - g.p[a + o]!) * k;
  return { x: L(0), y: L(1), z: L(2), state: STATES[g.p[a + 3]!] ?? "run", vx: L(4), vy: L(5), stride: L(6), until: t + g.p[a + 7]!, vaulting: false };
}
