import { describe, expect, it } from "vitest";
import { aiDrive, applyCarInput, createRace, sanitizeCarInput, standings, stepRace, takeRaceEvents } from "@/game/racing/sim";
import { buildTrack, TRACKS } from "@/game/racing/track";

describe("racing tracks", () => {
  it.each(Object.keys(TRACKS) as (keyof typeof TRACKS)[])("%s is a sensible closed circuit", (id) => {
    const t = buildTrack(id);
    expect(t.length).toBeGreaterThan(1000);
    expect(t.length).toBeLessThan(3000);
    let maxK = 0;
    for (const k of t.curv) maxK = Math.max(maxK, Math.abs(k));
    expect(1 / maxK).toBeGreaterThan(25); // no impossible hairpins
  });
});

describe("racing sim", () => {
  it("rejects malformed input", () => {
    expect(sanitizeCarInput("x")).toBeNull();
    expect(sanitizeCarInput({ seq: 1, steer: 5, throttle: -2, brake: 9 })).toEqual({ seq: 1, steer: 1, throttle: 0, brake: 1, handbrake: false });
  });
  it.each(Object.keys(TRACKS) as (keyof typeof TRACKS)[])("AI field finishes a 2-lap race on %s", (id) => {
    const s = createRace(id, 4, 2);
    let seq = 0;
    const laps: number[] = [];
    while (s.phase !== "finished" && s.t < 600) {
      seq++;
      s.cars.forEach((_, i) => applyCarInput(s, i, aiDrive(s, i, 0.9 - i * 0.1, seq)));
      stepRace(s, 1 / 30);
      for (const e of takeRaceEvents(s)) if (e.kind === "lap" && e.car === 0) laps.push(Number(e.detail!.split(":")[1]));
    }
    expect(s.phase).toBe("finished");
    expect(standings(s)).toHaveLength(4);
    expect(laps.length).toBe(2);
    for (const l of laps) {
      expect(l).toBeGreaterThan(20);
      expect(l).toBeLessThan(70);
    }
  });
});
