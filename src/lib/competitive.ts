/** Match history, leaderboards and friend tournaments (all data comes from server-side functions). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MatchConfig } from "./match-config";
import { useSession } from "./session";
import { rpc } from "./social";
import type { SportId } from "./sports";

export interface PlayerRef { id: string; username: string | null; display_name: string; country: string | null; level?: number }

export interface HistoryRow {
  id: string;
  sport: SportId;
  config: { mode?: string; length?: number };
  ended_at: string;
  tournament_id: string | null;
  won: boolean;
  draw: boolean;
  forfeit: boolean;
  rating_change: number | null;
  xp: number | null;
  scores: unknown;
  duration_seconds: number | null;
  opponent: PlayerRef | null;
}

export type Scope = SportId | "overall";
export interface LeaderRow { rank: number; rating: number; peak: number; games: number; wins: number; player: PlayerRef }
export interface Leaderboard { rows: LeaderRow[]; me: { rank: number; rating: number; games: number } | null }

export interface TournamentSummary { id: string; name: string; sport: SportId; status: "registration" | "in_progress" | "completed" | "cancelled" | "scheduled"; size: number; players: number; mine: boolean; joined: boolean; host: string }
export interface TournamentDetail {
  id: string; name: string; sport: SportId; status: TournamentSummary["status"]; size: number; config: { mode?: string; length?: number };
  created_by: string; can_join: boolean;
  players: (PlayerRef & { seed: number | null; final_position: number | null; eliminated: boolean })[];
  matches: { id: string; status: string; round: number; slot: number; winner: string | null; players: string[] }[];
}

/** Emoji flag from an ISO country code (no images needed). */
export function flag(country: string | null | undefined) {
  if (!country || !/^[A-Za-z]{2}$/.test(country)) return "";
  return String.fromCodePoint(...country.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function useHistory() {
  const { session } = useSession();
  return useQuery({
    queryKey: ["history", session?.user.id],
    enabled: !!session,
    queryFn: () => rpc<HistoryRow[]>("my_match_history", { lim: 50, before: null }),
  });
}

export function useLeaderboard(scope: Scope, friendsOnly: boolean) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["leaderboard", scope, friendsOnly, session?.user.id ?? null],
    enabled: !friendsOnly || !!session,
    staleTime: 30_000,
    queryFn: () => rpc<Leaderboard>("leaderboard", { p_scope: scope, friends_only: friendsOnly, lim: 100 }),
  });
}

export function useMyTournaments() {
  const { session } = useSession();
  return useQuery({ queryKey: ["tournaments", session?.user.id], enabled: !!session, queryFn: () => rpc<TournamentSummary[]>("my_tournaments", {}) });
}

export function useTournament(id: string) {
  const { session } = useSession();
  return useQuery({
    queryKey: ["tournament", id, session?.user.id],
    enabled: !!session,
    refetchInterval: 15_000,
    queryFn: () => rpc<TournamentDetail | null>("tournament_detail", { t: id }),
  });
}

function useTourMutation<A, R>(fn: (a: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ["tournaments"] });
      void qc.invalidateQueries({ queryKey: ["tournament"] });
    },
  });
}

export const useCreateTournament = () =>
  useTourMutation((a: { name: string; sport: SportId; config: MatchConfig; size: 4 | 8 }) => rpc<string>("create_tournament", { p_name: a.name, p_sport: a.sport, cfg: a.config, p_size: a.size }));
export const useJoinTournament = () => useTourMutation((id: string) => rpc("join_tournament", { t: id }));
export const useLeaveTournament = () => useTourMutation((id: string) => rpc("leave_tournament", { t: id }));
export const useStartTournament = () => useTourMutation((id: string) => rpc("start_tournament", { t: id }));
