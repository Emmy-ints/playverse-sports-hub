import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Public Supabase configuration. The URL and publishable key are safe to ship to browsers;
 * all protection comes from Row Level Security and column privileges in the database.
 * NEVER put the service-role key in frontend code.
 */
const SUPABASE_URL: string = import.meta.env["VITE_SUPABASE_URL"] ?? "https://piayiahsdcwvtocggyer.supabase.co";
const SUPABASE_PUBLISHABLE_KEY: string = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ?? "sb_publishable_1XWIk3wGPEJCaq-a6XCw2A_O1WzOYbN";

let client: SupabaseClient | null = null;

/** Browser-only client (sessions live in localStorage). Returns null during server rendering. */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
    });
  }
  return client;
}

export function requireSupabase(): SupabaseClient {
  const c = getSupabase();
  if (!c) throw new Error("Supabase is only available in the browser");
  return c;
}
