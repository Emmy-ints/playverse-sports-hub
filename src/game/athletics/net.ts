/** Wire format for online athletics: full event state (compact numbers), server → clients. */
import type { EventState } from "./sim.ts";

export const HUMANS = 2;
export const FIELD_SIZE = 6; // two players plus four AI athletes in the other lanes

const r3 = (n: number) => Math.round(n * 1000) / 1000;

export function eventSnapshot(s: EventState) {
  return {
    ...s,
    events: [],
    t: r3(s.t),
    athletes: s.athletes.map((a) => {
      const { ...rest } = a as typeof a & { _ai?: unknown };
      delete (rest as { _ai?: unknown })._ai;
      return { ...rest, x: r3(a.x), y: r3(a.y), v: r3(a.v), stride: r3(a.stride), jx: r3(a.jx), jy: r3(a.jy), airT: r3(a.airT) };
    }),
  } as EventState;
}

export interface AthleticsMeta { you: number; ids: string[]; names: string[]; avatars: unknown[]; events: string[] }

export type AthleticsServerMessage =
  | ({ t: "welcome"; sport: "athletics" } & AthleticsMeta)
  | { t: "s"; st: EventState; idx: number; points: number[] }
  | { t: "ev"; e: EventState["events"] }
  | { t: "wait"; msg: string; until?: number }
  | { t: "go" }
  | { t: "next"; idx: number; event: string; points: number[] }
  | { t: "end"; points: number[]; winner: number; forfeit: boolean; saved: boolean }
  | { t: "err"; code: string }
  | { t: "pong"; c: number };
