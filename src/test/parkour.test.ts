import { describe, expect, it } from "vitest";
import { aiInput, applyInput, createCourse, createRace, groundAt, LENGTHS, placings, stepRace, takeEvents } from "@/game/parkour/sim";

function run(seed: number, skills: number[], length: keyof typeof LENGTHS = "standard") {
  const s = createRace(skills.length, seed, length);
  let seq = 0;
  for (let n = 0; n < 60 * 150 && s.phase !== "over"; n++) {
    skills.forEach((k, i) => {
      const inp = aiInput(s, i, k, ++seq);
      if (inp) applyInput(s, i, inp);
    });
    stepRace(s, 1 / 60);
    takeEvents(s);
  }
  return s;
}

describe("Rooftop Rush course", () => {
  it("is the same for the same seed", () => {
    expect(JSON.stringify(createCourse(42))).toBe(JSON.stringify(createCourse(42)));
    expect(JSON.stringify(createCourse(42))).not.toBe(JSON.stringify(createCourse(43)));
  });
  it("has solid ground at the start and the finish, and every obstacle type over many seeds", () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed < 40; seed++) {
      const c = createCourse(seed);
      expect(groundAt(c, 0)).toBe(0);
      expect(groundAt(c, c.length + 5)).not.toBeNull();
      c.obstacles.forEach((o) => kinds.add(o.kind));
    }
    expect([...kinds].sort()).toEqual(["drop", "gap", "pad", "pipe", "vent", "wall"]);
  });
});

describe("Rooftop Rush race", () => {
  it("finishes, and better runners place higher on average", () => {
    let better = 0;
    for (const seed of [3, 17, 99, 1234, 5555, 777]) {
      const s = run(seed, [0.95, 0.15]);
      expect(s.phase).toBe("over");
      expect(s.runners.every((r) => r.finish !== null)).toBe(true);
      if (placings(s)[0] === 0) better++;
    }
    expect(better).toBeGreaterThanOrEqual(5);
  });
  it("lands courses in a sensible time (≈ 20–70 s)", () => {
    for (const len of ["sprint", "standard", "marathon"] as const) {
      const s = run(8, [0.9], len);
      expect(s.runners[0]!.finish!).toBeGreaterThan(15);
      expect(s.runners[0]!.finish!).toBeLessThan(75);
    }
  });
  it("never leaves a runner stuck: an idle runner still reaches the finish", () => {
    const s = createRace(1, 5);
    for (let n = 0; n < 60 * 200 && s.phase !== "over"; n++) stepRace(s, 1 / 60);
    expect(s.runners[0]!.finish).not.toBeNull();
  });
  it("ignores stale or junk input", () => {
    const s = createRace(1, 5);
    s.phase = "live";
    s.runners[0]!.state = "run";
    applyInput(s, 0, { seq: 5, key: "J", down: true });
    const buf = s.runners[0]!.jumpBuf;
    applyInput(s, 0, { seq: 4, key: "J", down: true });
    applyInput(s, 0, { seq: 6, key: "X" as "J", down: true });
    expect(s.runners[0]!.jumpBuf).toBe(buf);
    expect(s.runners[0]!.lastSeq).toBe(5);
  });
  it("is deterministic for the same inputs", () => {
    expect(JSON.stringify(run(31, [0.7, 0.4]).runners)).toBe(JSON.stringify(run(31, [0.7, 0.4]).runners));
  });
});
