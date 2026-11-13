import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { connectPresence, disconnectPresence } from "./presence";
import { useSession } from "./session";
import { qk } from "./social";
import { getSupabase } from "./supabase";

/**
 * Keeps social data live: subscribes to row changes the player is allowed to see (RLS applies
 * to Realtime) and refreshes the matching queries. Also runs presence for signed-in players.
 */
export function useLiveSync() {
  const { session, status } = useSession();
  const userId = session?.user.id ?? null;
  const qc = useQueryClient();

  useEffect(() => {
    if (status === "loading") return;
    connectPresence(userId);
    if (!userId) return () => disconnectPresence();
    const sb = getSupabase();
    if (!sb) return undefined;

    const refresh = (key: readonly string[]) => () => {
      void qc.invalidateQueries({ queryKey: [...key] });
    };
    const ch = sb
      .channel(`live:${userId}`)
      // New friendships always produce a notification, so notifications also refresh the friend list.
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, () => {
        [qk.notifications, qk.friends, qk.requests, qk.invitations].forEach((k) => void qc.invalidateQueries({ queryKey: [...k] }));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "friend_requests" }, refresh(qk.requests))
      .on("postgres_changes", { event: "*", schema: "public", table: "match_invitations" }, refresh(qk.invitations))
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [userId, status, qc]);
}

export function LiveSync() {
  useLiveSync();
  return null;
}
