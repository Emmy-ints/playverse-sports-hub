import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { CourseTheme, Surface } from "@/game/golf/course";
import type { ShotInput, ShotResult } from "@/game/golf/sim";
import { parseProfile } from "./profile";
import type { PlayerSummary } from "./social";
import { getSupabase } from "./supabase";

export interface GolfGameRow {
  match_id: string;
  hole_count: number;
  course_seed: number;
  theme: CourseTheme["id"];
  scoring: "stroke" | "match_play";
  player_order: string[];
  hole_index: number;
  balls: Record<string, { x: number; z: number; lie: Surface }>;
  hole_strokes: Record<string, number>;
  holed: Record<string, boolean>;
  card: Record<string, (number | null)[]>;
  current_player: string | null;
  turn_seq: number;
  last_shot_id: number | null;
  status: "playing" | "completed" | "abandoned";
}

export interface GolfMatchData {
  game: GolfGameRow | null;
  players: PlayerSummary[];
  result: { winner_id: string | null; is_draw: boolean; scores: Record<string, number>; stats: Record<string, unknown>; duration_seconds: number | null } | null;
}

const ERRORS: Record<string, string> = {
  NOT_YOUR_TURN: "It's not your turn.",
  STALE_SHOT: "The game moved on — refreshing.",
  GAME_NOT_ACTIVE: "This round has finished.",
  INVALID_SHOT: "That shot wasn't valid.",
  WRONG_HOLE: "The round moved to the next hole.",
  NOT_AUTHENTICATED: "Please log in again.",
};

export function useGolfMatch(matchId: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: ["golf-match", matchId],
    queryFn: async (): Promise<GolfMatchData | null> => {
      const sb = getSupabase();
      if (!sb) return null;
      const { data: match, error } = await sb.from("matches").select("id").eq("id", matchId).maybeSingle();
      if (error) throw error;
      if (!match) return null;
      const [{ data: game, error: gErr }, { data: parts, error: pErr }, { data: result, error: rErr }] = await Promise.all([
        sb.from("golf_games").select("*").eq("match_id", matchId).maybeSingle(),
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
        game: (game as GolfGameRow | null) ?? null,
        players: ids.flatMap((id) => {
          const p = byId.get(id);
          return p ? [{ id: p.id, username: p.username, display_name: p.display_name, public_id: p.public_id, level: p.level, avatar_config: p.avatar_config }] : [];
        }),
        result: (result as GolfMatchData["result"]) ?? null,
      };
    },
  });

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return undefined;
    void sb.functions.invoke("golf-shot", { method: "GET" }).catch(() => undefined); // wake the server
    const ch = sb
      .channel(`golf:${matchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "golf_games", filter: `match_id=eq.${matchId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["golf-match", matchId] });
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [matchId, qc]);
  return query;
}

export async function submitShot(matchId: string, seq: number, input: ShotInput): Promise<ShotResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Not available");
  const { data, error } = await sb.functions.invoke("golf-shot", { body: { match_id: matchId, seq, input } });
  if (error) {
    let code = "";
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) code = ((await ctx.json()) as { error?: string }).error ?? "";
    } catch {
      /* ignore */
    }
    throw new Error(ERRORS[code] ?? "The server couldn't process that shot. Check your connection and try again.");
  }
  return (data as { result: ShotResult }).result;
}

export async function fetchShot(id: number) {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from("golf_shots").select("player_id, hole_index, input, from_pos, frames, land_frame, outcome, end_pos, strokes").eq("id", id).maybeSingle();
  if (error || !data) return null;
  const result: ShotResult = {
    frames: data.frames as number[][],
    fps: 30,
    outcome: data.outcome as ShotResult["outcome"],
    end: data.end_pos as ShotResult["end"],
    strokes: data.strokes as number,
    carry: 0,
    total: 0,
    landFrame: data.land_frame as number,
  };
  return { player_id: data.player_id as string, hole_index: data.hole_index as number, input: data.input as ShotInput, from: data.from_pos as { x: number; z: number; lie: Surface }, result };
}

export async function startGolfMatch(matchId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Not available");
  const { error } = await sb.rpc("start_golf_match", { match: matchId });
  if (error) throw new Error(error.message);
}
