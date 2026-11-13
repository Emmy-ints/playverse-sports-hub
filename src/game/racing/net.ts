/** Wire format between the game server and racing clients (full state, ~1 KB, 30 Hz). */
import type { CarState, RaceState } from "./sim.ts";

export interface RaceSnapshot {
  t: number;
  ph: RaceState["phase"];
  sa: number;
  ea: number;
  fo: number[];
  c: (Omit<CarState, "input"> & { br: number })[];
}

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function raceSnapshotOf(s: RaceState): RaceSnapshot {
  return {
    t: r3(s.t), ph: s.phase, sa: s.startAt, ea: r3(s.endAt), fo: [...s.finishOrder],
    c: s.cars.map(({ input, ...c }) => ({ ...c, x: r3(c.x), z: r3(c.z), h: r3(c.h), vx: r3(c.vx), vz: r3(c.vz), yaw: r3(c.yaw), steer: r3(c.steer), br: input.brake })),
  };
}

export function applyRaceSnapshot(s: RaceState, snap: RaceSnapshot) {
  s.t = snap.t;
  s.phase = snap.ph;
  s.startAt = snap.sa;
  s.endAt = snap.ea;
  s.finishOrder = snap.fo;
  snap.c.forEach((q, i) => {
    const c = s.cars[i];
    if (!c) return;
    const { br, ...rest } = q;
    Object.assign(c, rest);
    c.input = { ...c.input, brake: br };
  });
}

/** Visual extrapolation between snapshots (no rules). */
export function extrapolateRace(s: RaceState, dt: number) {
  s.t += dt;
  if (s.phase !== "racing") return;
  for (const c of s.cars) {
    if (c.finished) continue;
    c.x += c.vx * dt;
    c.z += c.vz * dt;
    c.h += c.yaw * dt;
  }
}

export type RaceServerMessage =
  | { t: "welcome"; sport: "racing"; you: number; ids: string[]; names: string[]; avatars: unknown[]; laps: number; track: string }
  | { t: "s"; st: RaceSnapshot }
  | { t: "ev"; e: RaceState["events"] }
  | { t: "wait"; msg: string; until?: number }
  | { t: "go" }
  | { t: "end"; order: number[]; times: (number | null)[]; best: number[]; forfeit: boolean; saved: boolean }
  | { t: "err"; code: string }
  | { t: "pong"; c: number };
