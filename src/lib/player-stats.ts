import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "./supabase";

export interface SportStatRow { sport: string; matches_played: number; wins: number; losses: number; draws: number }
export interface RatingRow { scope: string; rating: number; games_rated: number; peak_rating: number }

/** Server-maintained stats and ratings for a player (read-only from the client). */
export function usePlayerStats(playerId: string | null) {
  return useQuery({
    queryKey: ["player-stats", playerId],
    enabled: !!playerId,
    queryFn: async () => {
      const sb = getSupabase();
      if (!sb || !playerId) return { stats: [] as SportStatRow[], ratings: [] as RatingRow[] };
      const [stats, ratings] = await Promise.all([
        sb.from("player_statistics").select("sport, matches_played, wins, losses, draws").eq("player_id", playerId),
        sb.from("player_ratings").select("scope, rating, games_rated, peak_rating").eq("player_id", playerId),
      ]);
      if (stats.error) throw stats.error;
      if (ratings.error) throw ratings.error;
      return { stats: (stats.data ?? []) as SportStatRow[], ratings: (ratings.data ?? []) as RatingRow[] };
    },
  });
}
