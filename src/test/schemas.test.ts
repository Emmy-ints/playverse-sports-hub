import { describe, expect, it } from "vitest";
import { avatarConfigSchema, DEFAULT_AVATAR } from "@/lib/avatar";
import { loginSchema, registerSchema } from "@/lib/auth-schemas";
import { NEW_GUEST, xpForNextLevel } from "@/lib/guest-profile";

describe("avatarConfigSchema", () => {
  it("accepts the default avatar", () => {
    expect(avatarConfigSchema.safeParse(DEFAULT_AVATAR).success).toBe(true);
  });
  it("rejects bad nicknames", () => {
    for (const nickname of ["ab", "has space", "x".repeat(17), "bad!"]) {
      expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, nickname }).success).toBe(false);
    }
  });
  it("rejects colours outside the palette", () => {
    expect(avatarConfigSchema.safeParse({ ...DEFAULT_AVATAR, skinTone: "#000000" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  const valid = { username: "Ace_99", email: "ace@example.com", password: "secret123", confirmPassword: "secret123", acceptTerms: true };
  it("accepts valid input", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });
  it("requires matching passwords", () => {
    expect(registerSchema.safeParse({ ...valid, confirmPassword: "other123" }).success).toBe(false);
  });
  it("requires a letter and number in the password", () => {
    expect(registerSchema.safeParse({ ...valid, password: "12345678", confirmPassword: "12345678" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...valid, password: "abcdefgh", confirmPassword: "abcdefgh" }).success).toBe(false);
  });
  it("requires accepting the terms", () => {
    expect(registerSchema.safeParse({ ...valid, acceptTerms: false }).success).toBe(false);
  });
  it("rejects invalid email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
});

describe("guest progression", () => {
  it("starts at level 1 with nothing earned", () => {
    expect(NEW_GUEST).toEqual({ level: 1, xp: 0, coins: 0 });
  });
  it("needs more XP for each level", () => {
    expect(xpForNextLevel(1)).toBe(100);
    expect(xpForNextLevel(2)).toBe(150);
    expect(xpForNextLevel(10)).toBeGreaterThan(xpForNextLevel(9));
  });
});
