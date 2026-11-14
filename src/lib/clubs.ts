/** Clubs: up to 30 players; monthly club points = members' All-Rounder points from verified online results. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "./session";
import { rpc } from "./social";

export interface ClubSummary { id: string; name: string; tag: string; description: string; color: string; members: number; points: number }
export interface ClubMember { id: string; username: string | null; display_name: string; country: string | null; level: number; role: "owner" | "member" }
export interface ClubDetail { id: string; name: string; tag: string; description: string; color: string; owner_id: string; created_at: string; points: number; mine: boolean; members: ClubMember[] }

export function useClubs(query: string) {
  const { session } = useSession();
  return useQuery({ queryKey: ["clubs", query], enabled: !!session, staleTime: 15_000, queryFn: () => rpc<ClubSummary[]>("list_clubs", { p_query: query, lim: 50 }) });
}

export function useClub(id: string | null) {
  const { session } = useSession();
  return useQuery({ queryKey: ["club", id ?? "mine", session?.user.id], enabled: !!session, queryFn: () => rpc<ClubDetail | null>("club_detail", { p_club: id }) });
}

function useClubMutation<A>(fn: (a: A) => Promise<unknown>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["club"] });
      void qc.invalidateQueries({ queryKey: ["clubs"] });
    },
  });
}

export const useCreateClub = () => useClubMutation((a: { name: string; tag: string; description: string; color: string }) => rpc<string>("create_club", { p_name: a.name, p_tag: a.tag, p_description: a.description, p_color: a.color }));
export const useJoinClub = () => useClubMutation((id: string) => rpc<null>("join_club", { p_club: id }));
export const useLeaveClub = () => useClubMutation(() => rpc<null>("leave_club", {}));
export const useKickMember = () => useClubMutation((player: string) => rpc<null>("kick_club_member", { p_player: player }));
