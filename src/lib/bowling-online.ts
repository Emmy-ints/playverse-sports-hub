import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ThrowInput } from "@/game/bowling/constants";
import type { SimResult } from "@/game/bowling/sim";
import { parseProfile } from "./profile";
import type { PlayerSummary } from "./social";
import { getSupabase } from "./supabase";

export interface BowlingGameState {
  match_id: string;
  frame_count: number;
  player_order: string[];
  rolls: Record<string, number[]>;
  current_player: string | null;
  standing: number[];
  turn_seq: number;
  last_throw_id: number | null;
  status: "playing" | "completed" | "abandoned";
  started_at: string;
}

export interface BowlingMatchData {
  game: BowlingGameState | null;
  matchStatus: string;
  config: { mode?: string; length?: number; rules?: string | null };
  players: PlayerSummary[];
  result: { winner_id: string | null; is_draw: boolean; scores: Record<string, number>; stats: Record<string, unknown>; duration_seconds: number | null } | null;
}

const ERRORS: Record<string, string> = {
  NOT_YOUR_TURN: "It's not your turn.",
  STALE_THROW: "The game moved on — refreshing.",
  GAME_NOT_ACTIVE: "This game has finished.",
  INVALID_THROW: "That throw wasn't valid.",
  GAME_NOT_FOUND: "Game not found.",
  NOT_AUTHENTICATED: "Please log in again.",
};

export function useBowlingMatch(matchId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["bowling-match", matchId],
    queryFn: async (): Promise<BowlingMatchData | null> => {
      const sb = getSupabase();
      if (!sb) return null;
      const { data: match, error } = await sb.from("matches").select("id, sport, status, config").eq("id", matchId).maybeSingle();
      if (error) throw error;
      if (!match) return null;
      const [{ data: game, error: gErr }, { data: parts, error: pErr }, { data: result, error: rErr }] = await Promise.all([
        sb.from("bowling_games").select("*").eq("match_id", matchId).maybeSingle(),
        sb.from("match_participants").select("player_id, slot").eq("match_id", matchId).order("slot"),
        sb.from("match_results").select("winner_id, is_draw, scores, stats, duration_seconds").eq("match_id", matchId).maybeSingle(),
      ]);
      if (gErr) throw gErr;
      if (pErr) throw pErr;
      if (rErr) throw rErr;
      const ids = (parts ?? []).map((p) => p.player_id as string);
      const { data: profiles, error: prErr } = await sb.from("profiles").select("id, username, display_name, public_id, level, avatar_config").in("id", ids);
      if (prErr) throw prErr;
      const byId = new Map((profiles ?? []).map((r) => [String(r.id), parseProfile(r)]));
      return {
        game: game ? ({ ...game, standing: (game.standing as number[]).map(Number) } as BowlingGameState) : null,
        matchStatus: match.status as string,
        config: (match.config ?? {}) as BowlingMatchData["config"],
        players: ids.flatMap((id) => {
          const p = byId.get(id);
          return p ? [{ id: p.id, username: p.username, display_name: p.display_name, public_id: p.public_id, level: p.level, avatar_config: p.avatar_config }] : [];
        }),
        result: (result as BowlingMatchData["result"]) ?? null,
      };
    },
  });

  // Live updates: every throw updates the game row.
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return undefined;
    const ch = sb
      .channel(`bowling:${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "bowling_games", filter: `match_id=eq.${matchId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["bowling-match", matchId] });
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [matchId, qc]);

  return query;
}

/** Ask the server to simulate and record a throw. Returns the server's simulation for replay. */
export async function submitThrow(matchId: string, seq: number, input: ThrowInput): Promise<SimResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Not available");
  const { data, error } = await sb.functions.invoke("bowling-throw", { body: { match_id: matchId, seq, input } });
  if (error) {
    let code = "";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = ((await ctx.json()) as { error?: string }).error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(ERRORS[code] ?? "The server couldn't process that throw. Check your connection and try again.");
  }
  return (data as { result: SimResult }).result;
}

/** Load a recorded throw (for replaying the opponent's ball). */
export async function fetchThrow(id: number): Promise<{ player_id: string; result: SimResult } | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb
    .from("bowling_throws")
    .select("player_id, frames, pins_order, knocked, pins_before, impact_frame, gutter")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  const knocked = (data.knocked as number[]).map(Number);
  const before = (data.pins_before as number[]).map(Number);
  return {
    player_id: data.player_id as string,
    result: {
      pins: (data.pins_order as number[]).map(Number),
      frames: data.frames as number[][],
      fps: 30,
      knocked,
      standing: before.filter((p) => !knocked.includes(p)),
      impactFrame: data.impact_frame as number,
      gutter: data.gutter as boolean,
    },
  };
}

export async function startBowlingMatch(matchId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Not available");
  const { error } = await sb.rpc("start_bowling_match", { match: matchId });
  if (error) throw new Error(error.message);
}
