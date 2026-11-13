import type { AuthError } from "@supabase/supabase-js";
import type { LoginInput, RecoveryInput, RegisterInput } from "./auth-schemas";
import { getSupabase } from "./supabase";

/**
 * Single auth entry point backed by Supabase Auth. Pages must not call Supabase auth directly.
 * Profiles, stats and ratings are created server-side by a database trigger on sign-up.
 */
export type AuthResult =
  | { ok: true; message?: string }
  | { ok: false; reason: "invalid" | "network" | "unverified" | "taken" | "unavailable"; message: string };

export const AUTH_CONNECTED = true;

function siteUrl(path: string) {
  return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

function fail(reason: Extract<AuthResult, { ok: false }>["reason"], message: string): AuthResult {
  return { ok: false, reason, message };
}

/** Turn Supabase errors into player-friendly messages without leaking internals. */
export function mapAuthError(err: AuthError | Error | null | undefined): AuthResult {
  const msg = (err?.message ?? "").toLowerCase();
  const code = err && "code" in err ? String(err.code ?? "") : "";
  if (code === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return fail("unverified", "Please verify your email first. Check your inbox for the confirmation link.");
  }
  if (code === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return fail("invalid", "Email or password is incorrect.");
  }
  if (code === "user_already_exists" || msg.includes("already registered")) {
    return fail("taken", "An account with this email already exists. Try logging in.");
  }
  if (msg.includes("username_taken")) return fail("taken", "That username is taken. Try another.");
  if (msg.includes("invalid_username")) return fail("invalid", "Usernames are 3–16 letters, numbers or underscores.");
  if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || msg.includes("rate limit")) {
    return fail("network", "Too many attempts. Please wait a minute and try again.");
  }
  if (code === "weak_password") return fail("invalid", "Choose a stronger password.");
  if (msg.includes("fetch") || msg.includes("network")) return fail("network", "Can't reach the server. Check your connection.");
  return fail("network", "Something went wrong. Please try again.");
}

function client() {
  return getSupabase();
}

const OFFLINE = fail("unavailable", "Accounts are unavailable right now. Please try again.");

export const authService = {
  async signIn(input: LoginInput): Promise<AuthResult> {
    const sb = client();
    if (!sb) return OFFLINE;
    const { error } = await sb.auth.signInWithPassword({ email: input.email, password: input.password });
    return error ? mapAuthError(error) : { ok: true };
  },

  async register(input: RegisterInput): Promise<AuthResult> {
    const sb = client();
    if (!sb) return OFFLINE;
    const { data: available, error: rpcError } = await sb.rpc("username_available", { candidate: input.username });
    if (rpcError) return mapAuthError(rpcError);
    if (!available) return fail("taken", "That username is taken. Try another.");

    const { data, error } = await sb.auth.signUp({
      email: input.email,
      password: input.password,
      options: { data: { username: input.username }, emailRedirectTo: siteUrl("/auth/callback") },
    });
    if (error) return mapAuthError(error);
    // Supabase returns a user with no identities when the email is already registered.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return fail("taken", "An account with this email already exists. Try logging in.");
    }
    if (data.session) return { ok: true, message: "Account created — you're signed in." };
    return { ok: true, message: `Almost there! We sent a confirmation link to ${input.email}. Open it to activate your account.` };
  },

  async resendVerification(email: string): Promise<AuthResult> {
    const sb = client();
    if (!sb) return OFFLINE;
    const { error } = await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: siteUrl("/auth/callback") } });
    return error ? mapAuthError(error) : { ok: true, message: "Confirmation email sent again." };
  },

  async requestPasswordReset(input: RecoveryInput): Promise<AuthResult> {
    const sb = client();
    if (!sb) return OFFLINE;
    const { error } = await sb.auth.resetPasswordForEmail(input.email, { redirectTo: siteUrl("/reset-password") });
    if (error) return mapAuthError(error);
    // Same message whether or not the account exists, so emails can't be enumerated.
    return { ok: true, message: "If an account exists for that email, a reset link is on its way." };
  },

  async updatePassword(password: string): Promise<AuthResult> {
    const sb = client();
    if (!sb) return OFFLINE;
    const { error } = await sb.auth.updateUser({ password });
    return error ? mapAuthError(error) : { ok: true, message: "Password updated." };
  },

  async signOut(): Promise<AuthResult> {
    const sb = client();
    if (!sb) return OFFLINE;
    const { error } = await sb.auth.signOut();
    return error ? mapAuthError(error) : { ok: true };
  },
};
