import type { LoginInput, RecoveryInput, RegisterInput } from "./auth-schemas";

/**
 * Single auth entry point. NOT CONNECTED in Milestone 1 — every call resolves with
 * `not_connected`. Milestone 2 replaces these bodies with Lovable Cloud auth calls;
 * pages must not call any auth provider directly.
 */
export type AuthResult = { ok: true } | { ok: false; reason: "not_connected" | "invalid" | "network"; message: string };

const NOT_CONNECTED: AuthResult = {
  ok: false,
  reason: "not_connected",
  message: "Accounts aren't live yet — sign-in arrives in the next update. You can keep playing as a guest.",
};

export const AUTH_CONNECTED = false;

async function stub(): Promise<AuthResult> {
  await new Promise((r) => setTimeout(r, 450));
  return NOT_CONNECTED;
}

export const authService = {
  signIn: (_input: LoginInput) => stub(),
  register: (_input: RegisterInput) => stub(),
  requestPasswordReset: (_input: RecoveryInput) => stub(),
  signOut: () => stub(),
};
