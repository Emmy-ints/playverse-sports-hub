/**
 * Tennis scoring: points → games → sets → match, with deuce/advantage and tiebreaks.
 * Pure and serialisable (plain numbers), shared by the client, practice AI and the game server.
 */

export interface MatchFormat {
  /** Best of N sets (1, 3 or 5). */
  bestOf: number;
  /** Games needed to win a set (4 for quick matches, 6 for standard). */
  gamesPerSet: number;
}

export interface Score {
  points: [number, number];
  games: [number, number];
  sets: [number, number];
  /** Completed set scores. */
  history: [number, number][];
  tiebreak: boolean;
  /** Player serving the current game (in a tiebreak: who served its first point). Use currentServer(). */
  server: 0 | 1;
  /** Points played in the current tiebreak (for service rotation). */
  tiebreakPoints: number;
  winner: 0 | 1 | null;
}

export function newScore(firstServer: 0 | 1 = 0): Score {
  return { points: [0, 0], games: [0, 0], sets: [0, 0], history: [], tiebreak: false, server: firstServer, tiebreakPoints: 0, winner: null };
}

const other = (p: 0 | 1): 0 | 1 => (p === 0 ? 1 : 0);

/** Award a point to player `p`. Returns a new score and what was completed. */
export function awardPoint(s0: Score, p: 0 | 1, fmt: MatchFormat): { score: Score; game: boolean; set: boolean; match: boolean } {
  const s: Score = { ...s0, points: [...s0.points] as [number, number], games: [...s0.games] as [number, number], sets: [...s0.sets] as [number, number], history: s0.history.map((h) => [...h] as [number, number]) };
  if (s.winner !== null) return { score: s, game: false, set: false, match: false };
  const o = other(p);
  s.points[p] += 1;
  let game = false;
  if (s.tiebreak) {
    s.tiebreakPoints += 1;
    if (s.points[p] >= 7 && s.points[p] - s.points[o] >= 2) game = true;
  } else if (s.points[p] >= 4 && s.points[p] - s.points[o] >= 2) {
    game = true;
  }
  if (!game) return { score: s, game: false, set: false, match: false };

  // Game won.
  s.games[p] += 1;
  const wasTiebreak = s.tiebreak;
  s.points = [0, 0];
  s.tiebreak = false;
  s.tiebreakPoints = 0;
  const g = fmt.gamesPerSet;
  let set = false;
  if (wasTiebreak || (s.games[p] >= g && s.games[p] - s.games[o] >= 2)) set = true;
  else if (s.games[0] === g && s.games[1] === g) s.tiebreak = true;
  // Next game: service alternates (after a tiebreak, the player who received its first point serves).
  s.server = other(s0.server);
  if (!set) return { score: s, game: true, set: false, match: false };

  s.sets[p] += 1;
  s.history.push([s.games[0], s.games[1]]);
  s.games = [0, 0];
  const need = Math.floor(fmt.bestOf / 2) + 1;
  if (s.sets[p] >= need) {
    s.winner = p;
    return { score: s, game: true, set: true, match: true };
  }
  return { score: s, game: true, set: true, match: false };
}

/** Who serves the next point. In a tiebreak: first point by `server`, then alternate every two points. */
export function currentServer(s: Score): 0 | 1 {
  if (!s.tiebreak) return s.server;
  return Math.floor((s.tiebreakPoints + 1) / 2) % 2 === 0 ? s.server : other(s.server);
}

const CALLS = ["0", "15", "30", "40"];

/** Scoreboard call for the current game from player `p`'s perspective, e.g. "30" / "AD" / "40". */
export function pointLabel(s: Score, p: 0 | 1): string {
  if (s.tiebreak) return String(s.points[p]);
  const a = s.points[p], b = s.points[other(p)];
  if (a >= 3 && b >= 3) return a === b ? "40" : a > b ? "AD" : "40";
  return CALLS[Math.min(a, 3)]!;
}

/** Spoken call, e.g. "15–30", "Deuce", "Advantage server". */
export function callout(s: Score): string {
  if (s.tiebreak) return `${s.points[0]}–${s.points[1]}`;
  const [a, b] = s.points;
  if (a >= 3 && b >= 3) return a === b ? "Deuce" : `Advantage`;
  if (a === b) return a === 0 ? "Love all" : `${CALLS[a]}-all`;
  return `${a === 0 ? "Love" : CALLS[a]}–${b === 0 ? "love" : CALLS[b]}`;
}

/** Which half the server serves from: deuce (right) on even point totals, ad (left) on odd. */
export function serveSide(s: Score): "deuce" | "ad" {
  return (s.points[0] + s.points[1]) % 2 === 0 ? "deuce" : "ad";
}

export function formatFromConfig(cfg: { mode?: string; length?: number }): MatchFormat {
  const bestOf = cfg.length === 3 || cfg.length === 5 ? cfg.length : 1;
  return { bestOf, gamesPerSet: cfg.mode === "standard" ? 6 : 4 };
}
