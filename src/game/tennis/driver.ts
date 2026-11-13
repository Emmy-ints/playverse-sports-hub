/**
 * A tennis "driver" feeds the stage: it owns (or mirrors) the match state, takes the local player's
 * input and returns events each frame. Practice runs the simulation locally against the AI; online
 * play uses a driver that talks to the authoritative game server instead.
 */
import { aiInput, applyInput, createMatch, step, takeEvents, type PlayerInput, type ShotType, type Surface, type TennisEvent, type TennisState } from "./sim.ts";
import type { MatchFormat } from "./scoring.ts";
import type { ViewFrame } from "./renderer.ts";
import { currentServer } from "./scoring.ts";

export type LocalInput = Omit<PlayerInput, "seq">;

export interface TennisDriver {
  readonly viewer: 0 | 1;
  /** Latest state for drawing and the HUD (local prediction for online play). */
  state(): TennisState;
  /** Movement every frame; `shot` only on the frame a shot is armed. */
  input(i: LocalInput): void;
  update(dt: number): TennisEvent[];
  /** Status line for the HUD, e.g. "Connecting…"; null when playing normally. */
  status(): string | null;
  destroy(): void;
}

export function toFrame(s: TennisState): ViewFrame {
  const pl = (p: 0 | 1) => {
    const x = s.players[p];
    return { x: x.x, z: x.z, vx: x.vx, vz: x.vz, swing: x.swing, swingAt: x.swingAt, armed: !!x.armed };
  };
  return { t: s.t, phase: s.phase, server: currentServer(s.score), players: [pl(0), pl(1)], ball: { ...s.ball } };
}

export class PracticeDriver implements TennisDriver {
  readonly viewer = 0 as const;
  private s: TennisState;
  private seq = 0;
  private pending: LocalInput = { mx: 0, mz: 0, sprint: false, shot: null };
  paused = false;

  constructor(format: MatchFormat, surface: Surface, private level: number, seed = Math.floor(Math.random() * 1e9)) {
    this.s = createMatch(format, surface, Math.random() < 0.5 ? 0 : 1, seed);
  }

  state() {
    return this.s;
  }

  input(i: LocalInput) {
    // Keep an armed shot until the next update consumes it.
    this.pending = { ...i, shot: i.shot ?? this.pending.shot ?? null };
  }

  update(dt: number) {
    if (this.paused) return [];
    const seq = ++this.seq;
    applyInput(this.s, 0, { ...this.pending, seq });
    this.pending = { ...this.pending, shot: null };
    applyInput(this.s, 1, aiInput(this.s, 1, this.level, seq));
    step(this.s, Math.min(dt, 1 / 20));
    return takeEvents(this.s);
  }

  status() {
    return null;
  }

  destroy() {}
}

export const SHOT_KEYS: Record<ShotType, { label: string; key: string }> = {
  topspin: { label: "Topspin", key: "J" },
  flat: { label: "Smash", key: "K" },
  lob: { label: "Lob", key: "L" },
  drop: { label: "Slice", key: "U" },
};
