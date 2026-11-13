import type { RealtimeChannel } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { getSupabase } from "./supabase";

/**
 * Live presence via Supabase Realtime. Status comes from real connected sessions:
 * a player is "online" only while a tab with an authenticated session is connected.
 */
export type PresenceStatus = "online" | "away" | "in_lobby" | "in_match";
type PresenceMeta = { user_id: string; status: PresenceStatus; at: number };

let channel: RealtimeChannel | null = null;
let myId: string | null = null;
let myStatus: PresenceStatus = "online";
let activity: PresenceStatus | null = null; // lobby/match override
let snapshot: ReadonlyMap<string, PresenceStatus> = new Map();
const listeners = new Set<() => void>();
const EMPTY: ReadonlyMap<string, PresenceStatus> = new Map();

const RANK: Record<PresenceStatus, number> = { in_match: 3, in_lobby: 2, online: 1, away: 0 };

function emit() {
  listeners.forEach((l) => l());
}

function recompute() {
  if (!channel) return;
  const state = channel.presenceState<PresenceMeta>();
  const next = new Map<string, PresenceStatus>();
  for (const metas of Object.values(state)) {
    for (const m of metas) {
      const cur = next.get(m.user_id);
      if (!cur || RANK[m.status] > RANK[cur]) next.set(m.user_id, m.status);
    }
  }
  snapshot = next;
  emit();
}

function effectiveStatus(): PresenceStatus {
  return activity ?? myStatus;
}

async function track() {
  if (channel && myId) await channel.track({ user_id: myId, status: effectiveStatus(), at: Date.now() } satisfies PresenceMeta);
}

function onVisibility() {
  myStatus = document.visibilityState === "hidden" ? "away" : "online";
  void track();
}

/** Start/stop presence for the signed-in user. Called by LiveSync. */
export function connectPresence(userId: string | null) {
  const sb = getSupabase();
  if (!sb) return;
  if (userId === myId && channel) return;
  disconnectPresence();
  if (!userId) return;
  myId = userId;
  channel = sb.channel("presence:global", { config: { presence: { key: userId } } });
  channel
    .on("presence", { event: "sync" }, recompute)
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        onVisibility();
      }
    });
  document.addEventListener("visibilitychange", onVisibility);
}

export function disconnectPresence() {
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisibility);
  if (channel) {
    void channel.untrack();
    void getSupabase()?.removeChannel(channel);
  }
  channel = null;
  myId = null;
  snapshot = new Map();
  emit();
}

/** Mark that you're in a lobby or match (null to clear). */
export function setActivity(next: PresenceStatus | null) {
  activity = next;
  void track();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function usePresenceMap(): ReadonlyMap<string, PresenceStatus> {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

export function usePresence(userId: string): PresenceStatus | "offline" {
  const map = usePresenceMap();
  return map.get(userId) ?? "offline";
}

export const PRESENCE_LABEL: Record<PresenceStatus | "offline", string> = {
  online: "Online",
  away: "Away",
  in_lobby: "In lobby",
  in_match: "In a match",
  offline: "Offline",
};
