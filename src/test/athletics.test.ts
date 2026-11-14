import { describe, expect, it } from "vitest";
import { aiEvent, applyEventInput, createEvent, EVENT_ORDER, EVENTS, placings, stepEvent, takeEventEvents } from "@/game/athletics/sim";

function run(ev: (typeof EVENT_ORDER)[number]) {
  const s = createEvent(ev, 4, 99);
  let seq = 0;
  const kinds = new Set<string>();
  while (s.phase !== "over" && s.t < 300) {
    s.athletes.forEach((_, i) => {
      const e = aiEvent(s, i, 0.9 - i * 0.15, ++seq);
      if (e) applyEventInput(s, i, e);
    });
    stepEvent(s, 1 / 60);
    takeEventEvents(s).forEach((e) => kinds.add(e.kind));
  }
  return { s, kinds };
}

describe("athletics", () => {
  it.each(EVENT_ORDER)("%s finishes with realistic results", (ev) => {
    const { s, kinds } = run(ev);
    expect(s.phase).toBe("over");
    expect(kinds.has("gun")).toBe(true);
    const best = s.athletes[placings(s)[0]!]!.finish!;
    if (ev === "sprint100") { expect(best).toBeGreaterThan(9.5); expect(best).toBeLessThan(16); }
    if (ev === "hurdles110") { expect(best).toBeGreaterThan(11); expect(best).toBeLessThan(19); }
    if (ev === "longjump") { expect(best).toBeGreaterThan(6); expect(best).toBeLessThan(9.6); }
    if (ev === "javelin") { expect(best).toBeGreaterThan(45); expect(best).toBeLessThan(100); }
    if (ev === "polevault") { expect(best).toBeGreaterThan(3.5); expect(best).toBeLessThan(6.6); }
    if (EVENTS[ev].kind === "field") expect(s.athletes[0]!.marks.length).toBe(3);
  });

  it("punishes a false start and a wrong key", () => {
    const s = createEvent("sprint100", 1, 5);
    applyEventInput(s, 0, { seq: 1, key: "L", down: true }); // before the gun
    expect(s.athletes[0]!.falseStart).toBe(true);
    stepEvent(s, 5);
    const v0 = s.athletes[0]!.v;
    const wrong = s.athletes[0]!.prompt === "L" ? "R" : "L";
    applyEventInput(s, 0, { seq: 2, key: wrong, down: true });
    expect(s.athletes[0]!.v).toBeLessThanOrEqual(v0);
  });

  it("fouls a long jump taken past the board", () => {
    const s = createEvent("longjump", 1, 5);
    stepEvent(s, 4);
    let seq = 0;
    for (let k = 0; k < 400 && s.athletes[0]!.x < 0.5; k++) {
      applyEventInput(s, 0, { seq: ++seq, key: s.athletes[0]!.prompt, down: true });
      stepEvent(s, 0.1);
    }
    applyEventInput(s, 0, { seq: ++seq, key: "A", down: true });
    applyEventInput(s, 0, { seq: ++seq, key: "A", down: false });
    expect(s.athletes[0]!.marks[0]).toBeNull();
  });
});
