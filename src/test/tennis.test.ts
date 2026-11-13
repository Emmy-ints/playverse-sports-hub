import { describe, expect, it } from "vitest";
import { awardPoint, callout, currentServer, newScore, type MatchFormat } from "@/game/tennis/scoring";
import { aiInput, applyInput, createMatch, sanitizeInput, step, takeEvents } from "@/game/tennis/sim";

const fmt: MatchFormat = { bestOf: 3, gamesPerSet: 6 };

function win(points: (0 | 1)[], f = fmt) {
  let s = newScore(0);
  for (const p of points) s = awardPoint(s, p, f).score;
  return s;
}

describe("tennis scoring", () => {
  it("counts 15-30-40 and deuce", () => {
    expect(callout(win([0]))).toBe("15–love");
    expect(callout(win([0, 0, 1, 1, 1, 0]))).toBe("Deuce");
  });
  it("wins a game by two points and switches server", () => {
    const s = win([0, 0, 0, 0]);
    expect(s.games).toEqual([1, 0]);
    expect(currentServer(s)).toBe(1);
  });
  it("plays a tiebreak at 6-6 and the match ends after two sets", () => {
    const game = (p: 0 | 1) => [p, p, p, p] as (0 | 1)[];
    let pts: (0 | 1)[] = [];
    for (let i = 0; i < 6; i++) pts = pts.concat(game(0), game(1));
    let s = win(pts);
    expect(s.tiebreak).toBe(true);
    for (let i = 0; i < 7; i++) s = awardPoint(s, 0, fmt).score;
    expect(s.sets).toEqual([1, 0]);
    for (let i = 0; i < 24; i++) s = awardPoint(s, 0, fmt).score;
    expect(s.winner).toBe(0);
  });
});

describe("tennis sim", () => {
  it("rejects malformed input", () => {
    expect(sanitizeInput(null)).toBeNull();
    const ok = sanitizeInput({ seq: 1, mx: 9, mz: -9, sprint: true, shot: { type: "flat", aim: 5, power: 3 } });
    expect(ok?.mx).toBe(1);
    expect(ok?.shot?.aim).toBe(1);
    expect(ok?.shot?.power).toBe(1);
  });
  it.each(["hard", "clay", "grass", "indoor"] as const)("AI vs AI finishes a match on %s with realistic rallies", (surface) => {
    const s = createMatch({ bestOf: 1, gamesPerSet: 4 }, surface, 0, 7);
    let seq = 0, hits = 0, points = 0;
    const how = new Set<string>();
    while (s.phase !== "matchOver" && s.t < 1800) {
      applyInput(s, 0, aiInput(s, 0, 0.62, ++seq));
      applyInput(s, 1, aiInput(s, 1, 0.6, seq));
      step(s, 1 / 30);
      for (const e of takeEvents(s)) {
        if (e.kind === "hit" && e.detail !== "serve") hits++;
        if (e.kind === "point") { points++; how.add(e.detail ?? ""); }
      }
    }
    expect(s.phase).toBe("matchOver");
    const avg = hits / points;
    expect(avg).toBeGreaterThan(2);
    expect(avg).toBeLessThan(14);
    expect(how.size).toBeGreaterThan(1); // not every point ends the same way
  });
});
