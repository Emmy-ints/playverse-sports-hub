import type { Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { parseProfile, type PlayerProfile } from "./profile";
import { getSupabase } from "./supabase";

type SessionState = { status: "loading" | "signed_out" | "signed_in"; session: Session | null; event?: string };

let state: SessionState = { status: "loading", session: null };
const listeners = new Set<() => void>();
let started = false;

function setState(next: SessionState) {
  state = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started) return;
  const sb = getSupabase();
  if (!sb) return;
  started = true;
  sb.auth.getSession().then(({ data }) => {
    setState({ status: data.session ? "signed_in" : "signed_out", session: data.session });
  });
  sb.auth.onAuthStateChange((event, session) => {
    setState({ status: session ? "signed_in" : "signed_out", session, event });
  });
}

function subscribe(l: () => void) {
  start();
  listeners.add(l);
  return () => listeners.delete(l);
}

const SERVER_STATE: SessionState = { status: "loading", session: null };

/** Current auth session. "loading" during SSR and until Supabase restores the stored session. */
export function useSession(): SessionState {
  return useSyncExternalStore(subscribe, () => state, () => SERVER_STATE);
}

/** The signed-in player's profile row (null for guests). */
export function useMyProfile() {
  const { session, status } = useSession();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();

  // Drop cached profile data when the account changes.
  useEffect(() => {
    if (status === "signed_out") qc.removeQueries({ queryKey: ["my-profile"] });
  }, [status, qc]);

  const query = useQuery({
    queryKey: ["my-profile", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<PlayerProfile | null> => {
      const sb = getSupabase();
      if (!sb || !userId) return null;
      const { data, error } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
      if (error) throw error;
      return data ? parseProfile(data) : null;
    },
  });
  return { ...query, profile: query.data ?? null, sessionStatus: status };
}
