// Supabase Edge Function: golf-shot — server-authoritative online golf.
// The shared rules are imported straight from the public GitHub repo, pinned to a commit, so the server
// runs byte-for-byte the same physics and match rules as the game client.
import { createClient } from "npm:@supabase/supabase-js@2";
import { generateHole } from "https://raw.githubusercontent.com/Emmy-ints/playverse-sports-hub/0e10a51a808f60350fe548907d652247a45c4b89/src/game/golf/course.ts";
import { isValidShot, simulateShot } from "https://raw.githubusercontent.com/Emmy-ints/playverse-sports-hub/0e10a51a808f60350fe548907d652247a45c4b89/src/game/golf/sim.ts";
import { applyShot, settle } from "https://raw.githubusercontent.com/Emmy-ints/playverse-sports-hub/0e10a51a808f60350fe548907d652247a45c4b89/src/game/golf/match.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    const user = u?.user;
    if (uErr || !user) return json(401, { error: "NOT_AUTHENTICATED" });

    const body = await req.json().catch(() => null);
    const matchId = body?.match_id, seq = body?.seq, input = body?.input;
    if (typeof matchId !== "string" || !Number.isInteger(seq)) return json(400, { error: "BAD_REQUEST" });
    if (!isValidShot(input)) return json(400, { error: "INVALID_SHOT" });

    const { data: g, error: gErr } = await admin.from("golf_games").select("*").eq("match_id", matchId).maybeSingle();
    if (gErr) throw gErr;
    if (!g || !(g.player_order as string[]).includes(user.id)) return json(404, { error: "GAME_NOT_FOUND" });
    if (g.status !== "playing") return json(409, { error: "GAME_NOT_ACTIVE" });
    if (g.current_player !== user.id) return json(409, { error: "NOT_YOUR_TURN" });
    if (g.turn_seq !== seq) return json(409, { error: "STALE_SHOT" });

    const order = g.player_order as string[];
    const hole = generateHole(g.hole_index, g.course_seed);
    const from = g.balls[user.id];
    const shot = { club: input.club, aim: input.aim, power: input.power, accuracy: input.accuracy };
    const result = simulateShot(hole, from, shot);
    const next = applyShot(
      { hole_index: g.hole_index, balls: g.balls, hole_strokes: g.hole_strokes, holed: g.holed, card: g.card, current_player: g.current_player },
      order, user.id, hole, g.hole_count, result,
    );
    let totals: Record<string, number> = {}, winner: string | null = null, draw = false, summary: Record<string, unknown> = {};
    if (next.complete) {
      const pars = Array.from({ length: g.hole_count }, (_, i) => generateHole(i, g.course_seed).par);
      const s = settle(order, next.card, pars, g.scoring);
      totals = s.totals; winner = s.winner; draw = s.draw; summary = s.summary;
    }
    const { data: shotId, error: aErr } = await admin.rpc("apply_golf_shot", {
      p_match: matchId, p_player: user.id, p_seq: seq, p_hole: g.hole_index, p_input: shot, p_from: from,
      p_frames: result.frames, p_land: result.landFrame, p_outcome: result.outcome, p_end: result.end, p_strokes: result.strokes,
      p_new_state: next, p_totals: totals, p_winner: winner, p_draw: draw, p_summary: summary,
    });
    if (aErr) {
      const code = ["NOT_YOUR_TURN", "STALE_SHOT", "GAME_NOT_ACTIVE", "WRONG_HOLE"].find((c) => aErr.message.includes(c));
      if (code) return json(409, { error: code });
      throw aErr;
    }
    console.log(JSON.stringify({ event: "shot", match: matchId, seq, hole: g.hole_index, outcome: result.outcome, complete: next.complete }));
    return json(200, { shot_id: shotId, result, state: next });
  } catch (e) {
    console.error("golf-shot failed", e);
    return json(500, { error: "SERVER_ERROR" });
  }
});
