/**
 * Talks to Supabase: verifies a player's access token and reads/settles matches through
 * secret-protected database functions (the plain secret lives only in this server's environment;
 * the database keeps a SHA-256 hash of it).
 */

export interface MatchPlayer { id: string; slot: number; name: string; avatar: unknown }
export interface MatchInfo { id: string; sport: string; status: string; config: { mode?: string; length?: number }; players: MatchPlayer[] }

export interface Backend {
  userFromToken(token: string): Promise<string | null>;
  /** Friends of a participant may watch a live match (checked with the viewer's own token). */
  canSpectate?(token: string, matchId: string): Promise<boolean>;
  matchInfo(matchId: string): Promise<MatchInfo | null>;
  settleTennis(matchId: string, winner: string, score: unknown, stats: unknown, forfeit: boolean): Promise<void>;
  settleRacing(matchId: string, winner: string, results: unknown, forfeit: boolean): Promise<void>;
  settleAthletics(matchId: string, winner: string, results: unknown, forfeit: boolean): Promise<void>;
  settleParkour(matchId: string, winner: string, results: unknown, forfeit: boolean): Promise<void>;
}

export function supabaseBackend(env: { url: string; anonKey: string; secret: string }): Backend {
  const headers = { apikey: env.anonKey, "Content-Type": "application/json" };
  const rpc = async (fn: string, body: unknown) => {
    const r = await fetch(`${env.url}/rest/v1/rpc/${fn}`, { method: "POST", headers, body: JSON.stringify(body), signal: AbortSignal.timeout(8000) });
    const text = await r.text();
    if (!r.ok) throw new Error(`${fn} ${r.status}: ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  };
  const cache = new Map<string, { id: string; until: number }>();
  return {
    async userFromToken(token) {
      const hit = cache.get(token);
      if (hit && hit.until > Date.now()) return hit.id;
      const r = await fetch(`${env.url}/auth/v1/user`, { headers: { apikey: env.anonKey, Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8000) });
      if (!r.ok) return null;
      const u = (await r.json()) as { id?: string };
      if (!u.id) return null;
      cache.set(token, { id: u.id, until: Date.now() + 5 * 60_000 });
      if (cache.size > 500) cache.delete(cache.keys().next().value as string);
      return u.id;
    },
    async canSpectate(token, matchId) {
      const r = await fetch(`${env.url}/rest/v1/rpc/can_spectate`, {
        method: "POST",
        headers: { ...headers, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ p_match: matchId }),
        signal: AbortSignal.timeout(8000),
      });
      return r.ok && (await r.json()) === true;
    },
    async matchInfo(matchId) {
      return (await rpc("realtime_match_info", { p_secret: env.secret, p_match: matchId })) as MatchInfo | null;
    },
    async settleTennis(matchId, winner, score, stats, forfeit) {
      await rpc("realtime_settle_tennis", { p_secret: env.secret, p_match: matchId, p_winner: winner, p_score: score, p_stats: stats, p_forfeit: forfeit });
    },
    async settleRacing(matchId, winner, results, forfeit) {
      await rpc("realtime_settle_racing", { p_secret: env.secret, p_match: matchId, p_winner: winner, p_results: results, p_forfeit: forfeit });
    },
    async settleAthletics(matchId, winner, results, forfeit) {
      await rpc("realtime_settle_athletics", { p_secret: env.secret, p_match: matchId, p_winner: winner, p_results: results, p_forfeit: forfeit });
    },
    async settleParkour(matchId, winner, results, forfeit) {
      await rpc("realtime_settle_parkour", { p_secret: env.secret, p_match: matchId, p_winner: winner, p_results: results, p_forfeit: forfeit });
    },
  };
}
