/**
 * PLAYVERSE real-time game server (tennis now; racing next). Plain Node — run with
 *   node --experimental-strip-types server/realtime/main.ts
 * Env: PORT, SUPABASE_URL, SUPABASE_ANON_KEY, REALTIME_SECRET, ALLOWED_ORIGINS (comma-separated; suffix match).
 */
import { createServer } from "node:http";
import { supabaseBackend, type Backend } from "./backend.ts";
import { TennisRoom } from "./tennis-room.ts";
import { accept, type Socket } from "./ws.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function startServer(opts: { port: number; backend: Backend; allowedOrigins: string[] }) {
  const rooms = new Map<string, TennisRoom>();
  const opening = new Map<string, Promise<TennisRoom | null>>();
  const perIp = new Map<string, number>();

  const allowOrigin = (origin: string | undefined) => {
    if (!origin) return false;
    try {
      const host = new URL(origin).hostname;
      return opts.allowedOrigins.some((o) => o === "*" || host === o || host.endsWith(`.${o}`));
    } catch {
      return false;
    }
  };

  const roomFor = (matchId: string): Promise<TennisRoom | null> => {
    const existing = rooms.get(matchId);
    if (existing) return Promise.resolve(existing);
    let p = opening.get(matchId);
    if (!p) {
      p = (async () => {
        const info = await opts.backend.matchInfo(matchId);
        if (!info || info.sport !== "tennis" || info.status !== "in_progress" || info.players.length !== 2) return null;
        const room = new TennisRoom(info, opts.backend);
        room.onDispose = () => rooms.delete(matchId);
        rooms.set(matchId, room);
        return room;
      })().finally(() => opening.delete(matchId));
      opening.set(matchId, p);
    }
    return p;
  };

  const handleJoin = async (socket: Socket, raw: string) => {
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return socket.close(4400, "bad message");
    }
    if (m["t"] !== "join" || typeof m["match"] !== "string" || !UUID.test(m["match"]) || typeof m["token"] !== "string" || m["token"].length > 4096) {
      return socket.close(4400, "join first");
    }
    const userId = await opts.backend.userFromToken(m["token"]).catch(() => null);
    if (!userId) {
      socket.send(JSON.stringify({ t: "err", code: "UNAUTHORIZED" }));
      return socket.close(4401, "unauthorized");
    }
    const room = await roomFor(m["match"]).catch((e) => {
      console.error("[server] match lookup failed", e);
      return null;
    });
    if (!room) {
      socket.send(JSON.stringify({ t: "err", code: "MATCH_UNAVAILABLE" }));
      return socket.close(4404, "match unavailable");
    }
    const seat = room.seatOf(userId);
    if (seat < 0) {
      socket.send(JSON.stringify({ t: "err", code: "NOT_IN_MATCH" }));
      return socket.close(4403, "not in match");
    }
    if (socket.closed) return;
    room.join(seat, socket);
  };

  const server = createServer((req, res) => {
    const origin = req.headers.origin;
    if (origin && allowOrigin(origin)) res.setHeader("Access-Control-Allow-Origin", origin);
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
      return;
    }
    res.writeHead(404).end();
  });

  server.on("upgrade", (req, sock) => {
    if (!req.url?.startsWith("/play")) {
      sock.destroy();
      return;
    }
    const socket = accept(req, sock, allowOrigin);
    if (!socket) return;
    const n = (perIp.get(socket.ip) ?? 0) + 1;
    perIp.set(socket.ip, n);
    const prevClose = () => {
      const c = (perIp.get(socket.ip) ?? 1) - 1;
      if (c <= 0) perIp.delete(socket.ip);
      else perIp.set(socket.ip, c);
    };
    if (n > 8) {
      socket.onClose = prevClose;
      return socket.close(4429, "too many connections");
    }
    // The first message must be a join; give up after 10 s.
    const joinTimer = setTimeout(() => socket.close(4408, "join timeout"), 10_000);
    let joining = false;
    socket.onClose = prevClose;
    socket.onMessage = (raw) => {
      if (joining) return;
      joining = true;
      clearTimeout(joinTimer);
      void handleJoin(socket, raw).then(() => {
        // The room replaces onClose; keep the per-IP counter correct.
        const roomClose = socket.onClose;
        socket.onClose = () => {
          prevClose();
          if (roomClose !== prevClose) roomClose();
        };
      });
    };
  });

  server.listen(opts.port);
  return { server, rooms };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const env = process.env;
  const url = env["SUPABASE_URL"], anonKey = env["SUPABASE_ANON_KEY"], secret = env["REALTIME_SECRET"];
  if (!url || !anonKey || !secret) {
    console.error("Missing SUPABASE_URL, SUPABASE_ANON_KEY or REALTIME_SECRET");
    process.exit(1);
  }
  const port = Number(env["PORT"] ?? 8080);
  const allowedOrigins = (env["ALLOWED_ORIGINS"] ?? "lovable.app,lovableproject.com,localhost").split(",").map((s) => s.trim()).filter(Boolean);
  startServer({ port, backend: supabaseBackend({ url, anonKey, secret }), allowedOrigins });
  console.log(`[playverse-realtime] listening on :${port}`);
}
