// Supabase Edge Function: bowling-throw
// Server-authoritative online bowling. The client sends only its throw input; the server checks it is
// that player's turn, validates the input, simulates the ball and pins with Rapier, scores the roll, and
// records everything atomically (public.apply_bowling_throw). Clients just replay the returned frames.
//
// Deployed to Supabase project piayiahsdcwvtocggyer. The shared simulation/scoring files
// (constants.ts, sim.ts, scoring.ts) are copied from src/game/bowling/ at deploy time.
import RAPIER from "npm:@dimforge/rapier3d-compat@0.14.0";
import { createClient } from "npm:@supabase/supabase-js@2";
import { isValidThrow } from "./constants.ts";
import { simulateThrow } from "./sim.ts";
import { countSpares, countStrikes, scoreGame } from "./scoring.ts";

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const rapierReady = RAPIER.init();

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "METHOD_NOT_ALLOWED" });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return json(401, { error: "NOT_AUTHENTICATED" });

    const body = await req.json().catch(() => null);
    const matchId = body?.match_id;
    const seq = body?.seq;
    const input = body?.input;
    if (typeof matchId !== "string" || !Number.isInteger(seq)) return json(400, { error: "BAD_REQUEST" });
    if (!isValidThrow(input)) return json(400, { error: "INVALID_THROW" });

    const { data: g, error: gErr } = await admin.from("bowling_games").select("*").eq("match_id", matchId).maybeSingle();
    if (gErr) throw gErr;
    if (!g || !(g.player_order as string[]).includes(user.id)) return json(404, { error: "GAME_NOT_FOUND" });
    if (g.status !== "playing") return json(409, { error: "GAME_NOT_ACTIVE" });
    if (g.current_player !== user.id) return json(409, { error: "NOT_YOUR_TURN" });
    if (g.turn_seq !== seq) return json(409, { error: "STALE_THROW", turn_seq: g.turn_seq });

    await rapierReady;
    const t0 = performance.now();
    const standing = (g.standing as number[]).map(Number);
    const sim = simulateThrow(RAPIER, { x: input.x, speed: input.speed, angle: input.angle, spin: input.spin }, standing);
    const simMs = Math.round(performance.now() - t0);

    const n = g.frame_count as number;
    const order = g.player_order as string[];
    const other = order.find((p) => p !== user.id)!;
    const rolls = g.rolls as Record<string, number[]>;
    const mine = rolls[user.id] ?? [];
    const theirs = rolls[other] ?? [];
    const newRolls = [...mine, sim.knocked.length];
    const before = scoreGame(mine, n);
    const after = scoreGame(newRolls, n);
    const theirView = scoreGame(theirs, n);
    const frameDone = after.complete || after.currentFrame !== before.currentFrame;

    let nextPlayer = user.id;
    let nextStanding = after.pinsStanding === 10 ? ALL : sim.standing;
    if (frameDone) {
      nextStanding = ALL;
      if (!theirView.complete) nextPlayer = other;
      else if (!after.complete) nextPlayer = user.id;
    }
    const complete = after.complete && theirView.complete;
    const all = { ...rolls, [user.id]: newRolls };
    const totals = Object.fromEntries(order.map((p) => [p, scoreGame(all[p] ?? [], n).total]));
    const stats = Object.fromEntries(order.map((p) => [p, { strikes: countStrikes(all[p] ?? [], n), spares: countSpares(all[p] ?? [], n) }]));

    const { data: throwId, error: applyErr } = await admin.rpc("apply_bowling_throw", {
      p_match: matchId,
      p_player: user.id,
      p_seq: seq,
      p_input: { x: input.x, speed: input.speed, angle: input.angle, spin: input.spin },
      p_pins_before: standing,
      p_knocked: sim.knocked,
      p_frames: sim.frames,
      p_pins_order: sim.pins,
      p_impact: sim.impactFrame,
      p_gutter: sim.gutter,
      p_new_rolls: newRolls,
      p_next_player: nextPlayer,
      p_next_standing: nextStanding,
      p_complete: complete,
      p_totals: totals,
      p_stats: stats,
    });
    if (applyErr) {
      const code = ["NOT_YOUR_TURN", "STALE_THROW", "GAME_NOT_ACTIVE"].find((c) => applyErr.message.includes(c));
      if (code) return json(409, { error: code });
      throw applyErr;
    }

    console.log(JSON.stringify({ event: "throw", match: matchId, seq, knocked: sim.knocked.length, simMs, complete }));
    return json(200, { throw_id: throwId, result: sim, complete, next_player: complete ? null : nextPlayer });
  } catch (e) {
    console.error("bowling-throw failed", e);
    return json(500, { error: "SERVER_ERROR" });
  }
});
