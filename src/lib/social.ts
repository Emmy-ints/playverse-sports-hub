import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseProfile, type PlayerProfile } from "./profile";
import { useSession } from "./session";
import type { SportId } from "./sports";
import { getSupabase } from "./supabase";
import type { MatchConfig } from "./match-config";

/** Public-safe player summary used across social screens. */
export type PlayerSummary = Pick<PlayerProfile, "id" | "username" | "display_name" | "public_id" | "level" | "avatar_config">;
const SUMMARY_COLS = "id, username, display_name, public_id, level, avatar_config";

const ERRORS: Record<string, string> = {
  ALREADY_IN_CLUB: "You're already in a club. Leave it first.",
  CLUB_TAKEN: "That club name or tag is taken.",
  CLUB_NOT_FOUND: "That club no longer exists.",
  CLUB_FULL: "That club is full (30 members).",
  NOT_CLUB_OWNER: "Only the club owner can do that.",
  clubs_tag_u: "That tag is taken.",
  "check constraint": "Check the name (3–32 characters) and tag (2–5 letters or numbers).",
  INVALID_SIZE: "Tournaments have 4 or 8 players.",
  INVALID_NAME: "Give the tournament a name (3–40 characters).",
  TOO_MANY_TOURNAMENTS: "You can run up to 3 tournaments at once.",
  TOURNAMENT_CLOSED: "That tournament has already started or ended.",
  TOURNAMENT_FULL: "That tournament is full.",
  NOT_FULL: "Wait until every spot is filled.",
  NOT_ALLOWED: "Only the host can do that.",
  NOT_AUTHENTICATED: "Please log in again.",
  ACCOUNT_RESTRICTED: "Your account is currently restricted.",
  CANNOT_ADD_SELF: "You can't add yourself.",
  PLAYER_NOT_FOUND: "Player not found.",
  PLAYER_UNAVAILABLE: "This player isn't available.",
  ALREADY_FRIENDS: "You're already friends.",
  REQUEST_PENDING: "Friend request already sent.",
  REQUEST_NOT_FOUND: "That request no longer exists.",
  REQUEST_CLOSED: "That request was already answered.",
  RATE_LIMITED: "Slow down — too many requests. Try again later.",
  CANNOT_BLOCK_SELF: "You can't block yourself.",
  CANNOT_REPORT_SELF: "You can't report yourself.",
  INVALID_REASON: "Choose a reason for the report.",
  CANNOT_CHALLENGE_SELF: "You can't challenge yourself.",
  NOT_FRIENDS: "You can only challenge friends.",
  INVALID_CONFIG: "That match format isn't allowed.",
  INVITATION_PENDING: "There's already a pending challenge between you two.",
  INVITATION_NOT_FOUND: "That challenge no longer exists.",
  INVITATION_CLOSED: "That challenge was already answered.",
  INVITATION_EXPIRED: "That challenge has expired.",
  NOT_IN_MATCH: "You're not in this match.",
  ROOM_NOT_FOUND: "No open room with that code. Check the code or ask your friend for a new one.",
  ROOM_FULL: "That room is already full.",
  ROOM_LEFT: "You left that room. Ask for a new code.",
  CHALLENGE_NOT_DONE: "Finish today's challenge first.",
  ALREADY_CLAIMED: "You already claimed today's reward.",
};

export class SocialError extends Error {}

export function friendlyError(raw: unknown): string {
  const msg = raw instanceof Error ? raw.message : typeof raw === "object" && raw && "message" in raw ? String((raw as { message: unknown }).message) : String(raw);
  const code = Object.keys(ERRORS).find((k) => msg.includes(k));
  return code ? (ERRORS[code] ?? msg) : "Something went wrong. Please try again.";
}

function sb() {
  const c = getSupabase();
  if (!c) throw new SocialError("Not available on the server");
  return c;
}

export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw new SocialError(friendlyError(error));
  return data as T;
}

function toSummary(row: Record<string, unknown>): PlayerSummary {
  const p = parseProfile(row);
  return { id: p.id, username: p.username, display_name: p.display_name, public_id: p.public_id, level: p.level, avatar_config: p.avatar_config };
}

async function profilesByIds(ids: string[]): Promise<Map<string, PlayerSummary>> {
  if (ids.length === 0) return new Map();
  const { data, error } = await sb().from("profiles").select(SUMMARY_COLS).in("id", ids);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [String(r.id), toSummary(r)]));
}

function useMe() {
  const { session } = useSession();
  return session?.user.id ?? null;
}

// ---------- Queries ----------
export const qk = {
  friends: ["friends"] as const,
  requests: ["friend-requests"] as const,
  blocks: ["blocks"] as const,
  invitations: ["invitations"] as const,
  notifications: ["notifications"] as const,
};

export function useFriends() {
  const me = useMe();
  return useQuery({
    queryKey: [...qk.friends, me],
    enabled: !!me,
    queryFn: async (): Promise<PlayerSummary[]> => {
      const { data, error } = await sb().from("friendships").select("user_a, user_b, created_at");
      if (error) throw error;
      const ids = (data ?? []).map((f) => (f.user_a === me ? f.user_b : f.user_a) as string);
      const map = await profilesByIds(ids);
      return ids.flatMap((id) => map.get(id) ?? []).sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
  });
}

export interface FriendRequestView { id: string; created_at: string; incoming: boolean; player: PlayerSummary }

export function useFriendRequests() {
  const me = useMe();
  return useQuery({
    queryKey: [...qk.requests, me],
    enabled: !!me,
    queryFn: async (): Promise<FriendRequestView[]> => {
      const { data, error } = await sb().from("friend_requests").select("id, sender_id, receiver_id, created_at").eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      const rows = data ?? [];
      const map = await profilesByIds(rows.map((r) => (r.sender_id === me ? r.receiver_id : r.sender_id) as string));
      return rows.flatMap((r) => {
        const incoming = r.receiver_id === me;
        const player = map.get((incoming ? r.sender_id : r.receiver_id) as string);
        return player ? [{ id: r.id as string, created_at: r.created_at as string, incoming, player }] : [];
      });
    },
  });
}

export function useBlocks() {
  const me = useMe();
  return useQuery({
    queryKey: [...qk.blocks, me],
    enabled: !!me,
    queryFn: async (): Promise<PlayerSummary[]> => {
      const { data, error } = await sb().from("player_blocks").select("blocked_id");
      if (error) throw error;
      const map = await profilesByIds((data ?? []).map((b) => b.blocked_id as string));
      return [...map.values()];
    },
  });
}

/** Search by exact public ID (PVXXXXXXXX) or username prefix. Excludes yourself. */
export function useSearchPlayers(term: string) {
  const me = useMe();
  const q = term.trim();
  return useQuery({
    queryKey: ["player-search", q, me],
    enabled: !!me && q.length >= 2,
    staleTime: 10_000,
    queryFn: async (): Promise<PlayerSummary[]> => {
      const isPublicId = /^pv[a-z0-9]{8}$/i.test(q);
      const safe = q.replace(/[%_\\]/g, (c) => `\\${c}`);
      let query = sb().from("profiles").select(SUMMARY_COLS).neq("id", me ?? "").limit(20);
      query = isPublicId ? query.eq("public_id", q.toUpperCase()) : query.ilike("username", `${safe}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []).map(toSummary);
    },
  });
}

export function usePlayerByUsername(username: string) {
  const me = useMe();
  return useQuery({
    queryKey: ["player", username.toLowerCase(), me],
    enabled: !!me,
    queryFn: async () => {
      const { data, error } = await sb().from("profiles").select("*").ilike("username", username.replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
      if (error) throw error;
      return data ? parseProfile(data) : null;
    },
  });
}

export interface InvitationView {
  id: string;
  sport: SportId;
  config: { mode?: string; length?: number; public?: boolean; rules?: string | null };
  status: string;
  created_at: string;
  expires_at: string;
  match_id: string | null;
  incoming: boolean;
  player: PlayerSummary;
}

export function useInvitations() {
  const me = useMe();
  return useQuery({
    queryKey: [...qk.invitations, me],
    enabled: !!me,
    refetchInterval: 30_000,
    queryFn: async (): Promise<InvitationView[]> => {
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { data, error } = await sb()
        .from("match_invitations")
        .select("id, from_id, to_id, sport, config, status, created_at, expires_at, match_id")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      const rows = data ?? [];
      const map = await profilesByIds(rows.map((r) => (r.from_id === me ? r.to_id : r.from_id) as string));
      return rows.flatMap((r) => {
        const incoming = r.to_id === me;
        const player = map.get((incoming ? r.from_id : r.to_id) as string);
        const expired = r.status === "pending" && new Date(r.expires_at as string).getTime() <= Date.now();
        return player
          ? [{
              id: r.id as string,
              sport: r.sport as SportId,
              config: (r.config ?? {}) as InvitationView["config"],
              status: expired ? "expired" : (r.status as string),
              created_at: r.created_at as string,
              expires_at: r.expires_at as string,
              match_id: (r.match_id as string | null) ?? null,
              incoming,
              player,
            }]
          : [];
      });
    },
  });
}

export interface NotificationView { id: string; type: string; payload: Record<string, unknown>; read_at: string | null; created_at: string }

export function useNotifications() {
  const me = useMe();
  return useQuery({
    queryKey: [...qk.notifications, me],
    enabled: !!me,
    queryFn: async (): Promise<NotificationView[]> => {
      const { data, error } = await sb().from("notifications").select("id, type, payload, read_at, created_at").order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      return (data ?? []) as NotificationView[];
    },
  });
}

// ---------- Mutations ----------
function useSocialMutation<A>(fn: (a: A) => Promise<unknown>, invalidate: readonly (readonly string[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      invalidate.forEach((k) => qc.invalidateQueries({ queryKey: [...k] }));
    },
  });
}

export const useSendFriendRequest = () =>
  useSocialMutation((target: string) => rpc<"sent" | "accepted">("send_friend_request", { target }), [qk.requests, qk.friends]);
export const useRespondFriendRequest = () =>
  useSocialMutation((a: { id: string; accept: boolean }) => rpc("respond_friend_request", { request_id: a.id, accept: a.accept }), [qk.requests, qk.friends, qk.notifications]);
export const useCancelFriendRequest = () => useSocialMutation((id: string) => rpc("cancel_friend_request", { request_id: id }), [qk.requests]);
export const useRemoveFriend = () => useSocialMutation((other: string) => rpc("remove_friend", { other }), [qk.friends, qk.invitations]);
export const useBlockPlayer = () => useSocialMutation((target: string) => rpc("block_player", { target }), [qk.friends, qk.requests, qk.blocks, qk.invitations]);
export const useUnblockPlayer = () => useSocialMutation((target: string) => rpc("unblock_player", { target }), [qk.blocks]);
export const useReportPlayer = () =>
  useSocialMutation((a: { target: string; reason: string; details?: string; match?: string }) =>
    rpc("report_player", { target: a.target, reason: a.reason, details: a.details ?? null, match: a.match ?? null }), []);
export const useCreateInvitation = () =>
  useSocialMutation((a: { target: string; sport: SportId; config: MatchConfig }) => rpc<string>("create_match_invitation", { target: a.target, s: a.sport, cfg: a.config }), [qk.invitations]);
export const useRespondInvitation = () =>
  useSocialMutation((a: { id: string; accept: boolean }) => rpc<string | null>("respond_match_invitation", { invitation_id: a.id, accept: a.accept }), [qk.invitations, qk.notifications]);
export const useCancelInvitation = () => useSocialMutation((id: string) => rpc("cancel_match_invitation", { invitation_id: id }), [qk.invitations]);
export const useMarkNotificationsRead = () =>
  useSocialMutation((ids: string[] | null) => rpc("mark_notifications_read", { ids }), [qk.notifications]);
export const leaveLobby = (match: string) => rpc("leave_lobby", { match });

// ---------- Private rooms, recent players, daily challenge ----------
export interface RecentPlayer extends PlayerSummary {
  country: string | null;
  last_played: string;
  games: number;
  last_sport: SportId;
  my_wins: number;
  their_wins: number;
  is_friend: boolean;
}
export function useRecentPlayers() {
  const me = useMe();
  return useQuery({
    queryKey: ["recent-players", me],
    enabled: !!me,
    queryFn: async () => (await rpc<RecentPlayer[]>("recent_players", { lim: 20 })) ?? [],
  });
}

export const createRoom = (sport: SportId, cfg: MatchConfig) => rpc<{ match_id: string; code: string }>("create_room", { s: sport, cfg });
export const joinRoom = (code: string) => rpc<string>("join_room", { p_code: code.trim().toUpperCase() });

export interface DailyChallenge {
  day: string;
  sport: SportId;
  kind: "play" | "win";
  title: string;
  goal: number;
  progress: number;
  done: boolean;
  claimed: boolean;
  reward_xp: number;
  resets_at: string;
}
export function useDailyChallenge() {
  const me = useMe();
  return useQuery({
    queryKey: ["daily-challenge", me],
    enabled: !!me,
    refetchInterval: 60_000,
    queryFn: () => rpc<DailyChallenge>("daily_challenge", {}),
  });
}
export function useClaimDaily() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => rpc<{ xp: number; total_xp: number }>("claim_daily_challenge", {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["daily-challenge"] });
      void qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });
}

export interface LiveMatch { id: string; sport: SportId; started_at: string; config: { mode?: string; length?: number }; players: { id: string; username: string | null; display_name: string; country: string | null; level: number }[] }

/** In-progress online matches your friends are playing (all real-time sports can be watched). */
export function useFriendsLive(enabled = true) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["friends-live", session?.user.id],
    enabled: enabled && !!session,
    refetchInterval: 20_000,
    queryFn: () => rpc<LiveMatch[]>("friends_live_matches", {}),
  });
}

export const WATCHABLE: readonly SportId[] = ["racing", "parkour", "tennis", "athletics"];
