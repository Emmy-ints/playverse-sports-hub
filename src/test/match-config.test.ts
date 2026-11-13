import { describe, expect, it } from "vitest";
import { describeConfig, isValidConfig, MATCH_FORMATS } from "@/lib/match-config";
import { friendlyError } from "@/lib/social";
import { formatCountdown, timeAgo } from "@/lib/time";

describe("match config", () => {
  it("accepts every sport's default format", () => {
    for (const sport of ["tennis", "bowling", "golf", "racing"] as const) {
      const f = MATCH_FORMATS[sport];
      expect(isValidConfig(sport, { mode: f.defaultMode, length: f.defaultLength, public: false })).toBe(true);
    }
  });
  it("rejects lengths the server would reject", () => {
    expect(isValidConfig("golf", { mode: "stroke", length: 7, public: false })).toBe(false);
    expect(isValidConfig("bowling", { mode: "frames", length: 4, public: false })).toBe(false);
    expect(isValidConfig("tennis", { mode: "bogus", length: 3, public: false })).toBe(false);
  });
  it("rejects over-long rules", () => {
    expect(isValidConfig("racing", { mode: "race", length: 3, public: false, rules: "x".repeat(201) })).toBe(false);
  });
  it("describes formats for people", () => {
    expect(describeConfig("golf", { mode: "stroke", length: 9 })).toBe("Stroke play · 9 holes");
    expect(describeConfig("tennis", { mode: "standard", length: 3 })).toBe("Standard · Best of 3 sets");
  });
});

describe("friendlyError", () => {
  it("maps server error codes", () => {
    expect(friendlyError(new Error("NOT_FRIENDS"))).toBe("You can only challenge friends.");
    expect(friendlyError({ message: "INVITATION_EXPIRED" })).toBe("That challenge has expired.");
  });
  it("hides unknown internals", () => {
    expect(friendlyError(new Error("relation secret_table does not exist"))).toBe("Something went wrong. Please try again.");
  });
});

describe("time helpers", () => {
  it("formats countdowns", () => {
    expect(formatCountdown(600_000)).toBe("10:00");
    expect(formatCountdown(61_000)).toBe("1:01");
    expect(formatCountdown(-5)).toBe("0:00");
  });
  it("formats relative times", () => {
    const now = Date.parse("2026-01-01T12:00:00Z");
    expect(timeAgo("2026-01-01T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-01-01T11:00:00Z", now)).toBe("1h ago");
  });
});
