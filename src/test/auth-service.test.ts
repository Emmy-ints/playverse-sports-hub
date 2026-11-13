import { describe, expect, it } from "vitest";
import { mapAuthError } from "@/lib/auth-service";
import { newPasswordSchema } from "@/lib/auth-schemas";

const err = (message: string, code?: string) => Object.assign(new Error(message), code ? { code } : {});

describe("mapAuthError", () => {
  it("maps unconfirmed email", () => {
    expect(mapAuthError(err("Email not confirmed", "email_not_confirmed"))).toMatchObject({ ok: false, reason: "unverified" });
  });
  it("maps bad credentials without revealing which field was wrong", () => {
    const r = mapAuthError(err("Invalid login credentials", "invalid_credentials"));
    expect(r).toMatchObject({ ok: false, reason: "invalid", message: "Email or password is incorrect." });
  });
  it("maps the database username trigger errors", () => {
    expect(mapAuthError(err("Database error saving new user: USERNAME_TAKEN"))).toMatchObject({ reason: "taken" });
    expect(mapAuthError(err("INVALID_USERNAME"))).toMatchObject({ reason: "invalid" });
  });
  it("maps rate limits", () => {
    expect(mapAuthError(err("Email rate limit exceeded", "over_email_send_rate_limit"))).toMatchObject({ reason: "network" });
  });
  it("never echoes unknown internal messages", () => {
    const r = mapAuthError(err("relation public.secret does not exist"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).not.toContain("secret");
  });
});

describe("newPasswordSchema", () => {
  it("requires matching strong passwords", () => {
    expect(newPasswordSchema.safeParse({ password: "secret123", confirmPassword: "secret123" }).success).toBe(true);
    expect(newPasswordSchema.safeParse({ password: "secret123", confirmPassword: "secret124" }).success).toBe(false);
    expect(newPasswordSchema.safeParse({ password: "short1", confirmPassword: "short1" }).success).toBe(false);
  });
});
