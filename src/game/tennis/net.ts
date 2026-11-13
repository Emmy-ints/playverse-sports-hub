/**
 * Wire format between the tennis game server and clients. Snapshots carry the full match state
 * (small: ~1 KB) 30 times a second; clients rebuild a TennisState mirror from them.
 */
import { createMatch, type BallState, type PlayerState, type PlayerStats, type Phase, type TennisState } from "./sim.ts";
import type { MatchFormat, Score } from "./scoring.ts";

export interface Snapshot {
  time: number;
  ph: Phase;
  pu: number;
  sc: Score;
  f: number;
  st: [PlayerStats, PlayerStats];
  p: { x: number; z: number; vx: number; vz: number; a: PlayerState["armed"]; sp: number; sw: PlayerState["swing"]; sa: number; ls: number }[];
  b: BallState;
}

export function snapshotOf(s: TennisState): Snapshot {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  return {
    time: r(s.t), ph: s.phase, pu: r(s.phaseUntil), sc: s.score, f: s.faults, st: s.stats,
    p: s.players.map((p) => ({ x: r(p.x), z: r(p.z), vx: r(p.vx), vz: r(p.vz), a: p.armed ? { ...p.armed, until: r(p.armed.until) } : null, sp: r(p.special), sw: p.swing, sa: r(p.swingAt), ls: p.lastSeq })),
    b: { ...s.ball, x: r(s.ball.x), y: r(s.ball.y), z: r(s.ball.z), vx: r(s.ball.vx), vy: r(s.ball.vy), vz: r(s.ball.vz) },
  };
}

export function mirrorState(format: MatchFormat): TennisState {
  return createMatch(format, "hard", 0, 1);
}

/** Overwrite a client-side mirror with a server snapshot. */
export function applySnapshot(s: TennisState, snap: Snapshot) {
  s.t = snap.time;
  s.phase = snap.ph;
  s.phaseUntil = snap.pu;
  s.score = snap.sc;
  s.faults = snap.f;
  s.stats = snap.st;
  snap.p.forEach((q, i) => {
    const pl = s.players[i as 0 | 1];
    pl.x = q.x; pl.z = q.z; pl.vx = q.vx; pl.vz = q.vz;
    pl.armed = q.a; pl.special = q.sp; pl.swing = q.sw; pl.swingAt = q.sa;
  });
  s.ball = { ...snap.b };
}

const G = 9.81;
/** Cheap visual extrapolation between snapshots (no rules — the server decides outcomes). */
export function extrapolate(s: TennisState, dt: number) {
  s.t += dt;
  for (const p of s.players) {
    p.x += p.vx * dt;
    p.z += p.vz * dt;
  }
  const b = s.ball;
  if (s.phase !== "rally") return;
  b.x += b.vx * dt;
  b.z += b.vz * dt;
  b.vy -= (G + 9 * b.spin * 0.35) * dt;
  b.y += b.vy * dt;
  if (b.y < 0.033 && b.vy < 0) {
    b.y = 0.033;
    b.vy = -b.vy * 0.72;
  }
}

export type ServerMessage =
  | { t: "welcome"; you: 0 | 1; ids: [string, string]; names: [string, string]; avatars: [unknown, unknown]; format: MatchFormat; theme: string }
  | { t: "s"; st: Snapshot }
  | { t: "ev"; e: TennisState["events"] }
  | { t: "wait"; msg: string; until?: number }
  | { t: "go" }
  | { t: "end"; winner: 0 | 1 | null; score: Score; stats: [PlayerStats, PlayerStats]; forfeit: boolean; saved: boolean }
  | { t: "err"; code: string }
  | { t: "pong"; c: number };
