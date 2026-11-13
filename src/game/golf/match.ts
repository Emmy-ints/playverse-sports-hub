/**
 * Online golf match rules (pure; used by the golf-shot server function and the client).
 * Turn order follows golf etiquette: the player farthest from the hole plays first; on a new tee
 * the player with the lower score on the previous hole has the honour.
 */
import { distanceToCup, type Hole, type Surface } from "./course.ts";
import { matchPlay, maxStrokes } from "./scoring.ts";
import type { ShotResult } from "./sim.ts";

export type Ball = { x: number; z: number; lie: Surface };

export interface GolfState {
  hole_index: number;
  balls: Record<string, Ball>;
  hole_strokes: Record<string, number>;
  holed: Record<string, boolean>;
  card: Record<string, (number | null)[]>;
  current_player: string | null;
  complete: boolean;
}

const TEE: Ball = { x: 0, z: 0, lie: "tee" };

export function applyShot(
  state: Omit<GolfState, "complete">,
  order: readonly string[],
  player: string,
  hole: Hole,
  holeCount: number,
  result: ShotResult,
): GolfState {
  const idx = state.hole_index;
  const balls = { ...state.balls, [player]: result.outcome === "holed" ? { x: hole.cup.x, z: hole.cup.z, lie: "green" as Surface } : result.end };
  const strokes = (state.hole_strokes[player] ?? 0) + result.strokes;
  const hole_strokes = { ...state.hole_strokes, [player]: strokes };
  const holed = { ...state.holed };
  const card: Record<string, (number | null)[]> = Object.fromEntries(Object.entries(state.card).map(([k, v]) => [k, [...v]]));
  const cap = maxStrokes(hole.par);
  if (result.outcome === "holed" || strokes >= cap) {
    holed[player] = true;
    card[player]![idx] = Math.min(strokes, cap);
  }

  const remaining = order.filter((p) => !holed[p]);
  if (remaining.length > 0) {
    // Farthest from the hole plays next.
    const next = [...remaining].sort((a, b) => distanceToCup(hole, balls[b]!.x, balls[b]!.z) - distanceToCup(hole, balls[a]!.x, balls[a]!.z))[0]!;
    return { hole_index: idx, balls, hole_strokes, holed, card, current_player: next, complete: false };
  }

  // Hole finished by everyone.
  if (idx + 1 >= holeCount) {
    return { hole_index: idx, balls, hole_strokes, holed, card, current_player: null, complete: true };
  }
  const [a, b] = order as [string, string];
  const sa = card[a]![idx] ?? 99, sb = card[b]![idx] ?? 99;
  const honour = sb < sa ? b : a;
  return {
    hole_index: idx + 1,
    balls: Object.fromEntries(order.map((p) => [p, { ...TEE }])),
    hole_strokes: Object.fromEntries(order.map((p) => [p, 0])),
    holed: Object.fromEntries(order.map((p) => [p, false])),
    card,
    current_player: honour,
    complete: false,
  };
}

export function settle(order: readonly string[], card: Record<string, (number | null)[]>, pars: readonly number[], scoring: "stroke" | "match_play") {
  const [a, b] = order as [string, string];
  const total = (p: string) => (card[p] ?? []).reduce<number>((s, v) => s + (v ?? 0), 0);
  const totals = { [a]: total(a), [b]: total(b) };
  let winner: string | null = null;
  let draw = false;
  const mp = matchPlay(card[a] ?? [], card[b] ?? []);
  if (scoring === "match_play") {
    if (mp.a > mp.b) winner = a;
    else if (mp.b > mp.a) winner = b;
    else draw = true;
  } else {
    if (totals[a]! < totals[b]!) winner = a;
    else if (totals[b]! < totals[a]!) winner = b;
    else draw = true;
  }
  const players = Object.fromEntries(
    order.map((p) => [p, {
      total: totals[p],
      birdies: (card[p] ?? []).filter((v, i) => v != null && v < (pars[i] ?? 0)).length,
      aces: (card[p] ?? []).filter((v) => v === 1).length,
    }]),
  );
  return { totals, winner, draw, summary: { scoring, players, holes_won: { [a]: mp.a, [b]: mp.b, halved: mp.halved } } };
}
