/**
 * Standard ten-pin scoring. Pure functions with no imports, shared by the browser and the server.
 * A game is a flat list of rolls (pins knocked down by each ball).
 */

export interface FrameView {
  /** Rolls in this frame, as pin counts. */
  rolls: number[];
  /** Score marks as shown on a scoreboard: "X", "/", "-", or a digit. */
  marks: string[];
  /** Running total once the frame can be scored, else null (waiting for bonus balls). */
  total: number | null;
}

export interface GameView {
  frames: FrameView[];
  total: number;
  complete: boolean;
  /** 0-based frame index the next roll belongs to (9 for the tenth), or null when complete. */
  currentFrame: number | null;
  /** 1-based ball number within the current frame. */
  ballInFrame: number;
  /** Pins available for the next ball (10 = fresh rack). */
  pinsStanding: number;
}

export function isValidRoll(rolls: readonly number[], pins: number): boolean {
  if (!Number.isInteger(pins) || pins < 0 || pins > 10) return false;
  const g = scoreGame(rolls);
  if (g.complete) return false;
  return pins <= g.pinsStanding;
}

export function scoreGame(rolls: readonly number[]): GameView {
  const frames: FrameView[] = [];
  let i = 0;
  let running = 0;
  let scoringOpen = true;

  for (let f = 0; f < 10; f++) {
    const rest = rolls.slice(i);
    if (rest.length === 0) break;
    if (f < 9) {
      const a = rest[0] ?? 0;
      if (a === 10) {
        const b1 = rolls[i + 1], b2 = rolls[i + 2];
        const total = scoringOpen && b1 !== undefined && b2 !== undefined ? (running += 10 + b1 + b2) : null;
        if (total === null) scoringOpen = false;
        frames.push({ rolls: [10], marks: ["X"], total });
        i += 1;
      } else {
        const b = rest[1];
        if (b === undefined) {
          frames.push({ rolls: [a], marks: [mark(a)], total: null });
          i += 1;
          scoringOpen = false;
          break;
        }
        const spare = a + b === 10;
        const bonus = rolls[i + 2];
        const total = scoringOpen && (!spare || bonus !== undefined) ? (running += a + b + (spare ? (bonus ?? 0) : 0)) : null;
        if (total === null) scoringOpen = false;
        frames.push({ rolls: [a, b], marks: [mark(a), spare ? "/" : mark(b)], total });
        i += 2;
      }
    } else {
      // Tenth frame: up to three balls.
      const [a, b, c] = rest;
      const marks: string[] = [];
      const fr: number[] = [];
      if (a !== undefined) { fr.push(a); marks.push(a === 10 ? "X" : mark(a)); }
      if (b !== undefined) {
        fr.push(b);
        if (a === 10) marks.push(b === 10 ? "X" : mark(b));
        else marks.push(a! + b === 10 ? "/" : mark(b));
      }
      if (c !== undefined) {
        fr.push(c);
        if (a === 10 && b !== 10) marks.push(b! + c === 10 ? "/" : mark(c));
        else marks.push(c === 10 ? "X" : mark(c));
      }
      const needsThird = a !== undefined && b !== undefined && (a === 10 || a + b === 10);
      const done = a !== undefined && b !== undefined && (!needsThird || c !== undefined);
      const total = scoringOpen && done ? (running += fr.reduce((s, n) => s + n, 0)) : null;
      frames.push({ rolls: fr, marks, total });
      i += fr.length;
    }
  }

  const last = frames[frames.length - 1];
  const tenth = frames.length === 10 ? frames[9] : undefined;
  const complete = !!tenth && tenth.total !== null;

  // Where does the next ball go, and how many pins are up?
  let currentFrame: number | null = null;
  let ballInFrame = 1;
  let pinsStanding = 10;
  if (!complete) {
    if (!last) {
      currentFrame = 0;
    } else if (frames.length < 10) {
      const lastIdx = frames.length - 1;
      const fr = last.rolls;
      if (fr.length === 1 && fr[0] !== 10) {
        currentFrame = lastIdx;
        ballInFrame = 2;
        pinsStanding = 10 - (fr[0] ?? 0);
      } else {
        currentFrame = lastIdx + 1;
      }
    } else {
      currentFrame = 9;
      const fr = tenth!.rolls;
      ballInFrame = fr.length + 1;
      if (fr.length === 1) pinsStanding = fr[0] === 10 ? 10 : 10 - (fr[0] ?? 0);
      else if (fr.length === 2) {
        const [a, b] = fr as [number, number];
        if (a === 10) pinsStanding = b === 10 ? 10 : 10 - b;
        else pinsStanding = 10; // spare: fresh rack
      }
    }
  }

  return {
    frames,
    total: running,
    complete,
    currentFrame,
    ballInFrame,
    pinsStanding,
  };
}

/** True when the next ball should be thrown at a full rack. */
export function nextRackIsFresh(rolls: readonly number[]): boolean {
  return scoreGame(rolls).pinsStanding === 10;
}

export function countStrikes(rolls: readonly number[]): number {
  return scoreGame(rolls).frames.reduce((n, f) => n + f.marks.filter((m) => m === "X").length, 0);
}

export function countSpares(rolls: readonly number[]): number {
  return scoreGame(rolls).frames.reduce((n, f) => n + f.marks.filter((m) => m === "/").length, 0);
}

function mark(n: number): string {
  return n === 0 ? "-" : String(n);
}
