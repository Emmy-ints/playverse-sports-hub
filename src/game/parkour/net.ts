/** Wire format for online Rooftop Rush. The course is rebuilt on each side from its seed, so
 *  snapshots only carry the runners and the race clock. */
import type { ParkourEvent, RaceState, Runner } from "./sim.ts";

export const HUMANS = 2;
export const FIELD_SIZE = 4; // two players plus two computer runners

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface RaceSnapshot { t: number; goAt: number; phase: RaceState["phase"]; order: number[]; overAt: number; runners: Runner[] }

export function raceSnapshot(s: RaceState): RaceSnapshot {
  return {
    t: r3(s.t), goAt: s.goAt, phase: s.phase, order: [...s.order], overAt: r3(s.overAt),
    runners: s.runners.map((a) => ({ ...a, x: r3(a.x), y: r3(a.y), vx: r3(a.vx), vy: r3(a.vy), stride: r3(a.stride), boost: r3(a.boost), airT: r3(a.airT), passed: [...a.passed] })),
  };
}

export interface ParkourMeta { you: number; ids: string[]; names: string[]; avatars: unknown[]; seed: number; length: number }

export type ParkourServerMessage =
  | ({ t: "welcome"; sport: "parkour" } & ParkourMeta)
  | { t: "s"; st: RaceSnapshot }
  | { t: "ev"; e: ParkourEvent[] }
  | { t: "wait"; msg: string; until?: number }
  | { t: "go" }
  | { t: "end"; order: number[]; times: (number | null)[]; winner: number; forfeit: boolean; saved: boolean }
  | { t: "err"; code: string }
  | { t: "pong"; c: number };
