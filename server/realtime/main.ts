/**
 * PLAYVERSE real-time game server: live tennis and racing. Plain Node — run with
 *   node --experimental-strip-types server/realtime/main.ts
 * Env: PORT, SUPABASE_URL, SUPABASE_ANON_KEY, REALTIME_SECRET, ALLOWED_ORIGINS (comma-separated; suffix match).
 */
import { createServer } from "node:http";
import { supabaseBackend, type Backend } from "./backend.ts";
import { AthleticsRoom } from "./athletics-room.ts";
import { ParkourRoom } from "./parkour-room.ts";
import { RaceRoom } from "./race-room.ts";
import { TennisRoom } from "./tennis-room.ts";

type Room = TennisRoom | RaceRoom | AthleticsRoom | ParkourRoom;
import { accept, type Socket } from "./ws.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function startServer(opts: { port: number; backend: Backend; allowedOrigins: string[] }) {
  const rooms = new Map<string, Room>();
  const opening = new Map<string, Promise<Room | null>>();
  const perIp = new Map<string, number>();
  /**
   * Spectators: read-only sockets that receive a copy of everything the room sends to seat 0
   * (welcome, snapshots, events, end). Their messages are ignored apart from ping.
   */
  const watchers = new Map<string, { sockets: Set<Socket>; welcome: string | null; status: string | null }>();
  const watchFor = (id: string) => {
    let w = watchers.get(id);
    if (!w) watchers.set(id, (w = { sockets: new Set(), welcome: null, status: null }));
    return w;
  };
  const teeSeat0 = (matchId: string, socket: Socket) => {
    const w = watchFor(matchId);
    const send = socket.send.bind(socket);
    socket.send = (text: string) => {
      send(text);
      if (text.startsWith('{"t":"pong"')) return;
      if (text.startsWith('{"t":"welcome"')) w.welcome = text.replace('"you":0', '"you":0,"spectator":true');
      else if (text.startsWith('{"t":"wait"') || text.startsWith('{"t":"go"') || text.startsWith('{"t":"end"')) w.status = text;
      for (const v of w.sockets) v.send(text.startsWith('{"t":"welcome"') ? w.welcome! : text);
    };
  };
  const watch = (matchId: string, socket: Socket) => {
    const w = watchFor(matchId);
    if (w.sockets.size >= 20) {
      socket.send(JSON.stringify({ t: "err", code: "TOO_MANY_SPECTATORS" }));
      return socket.close(4429, "too many spectators");
    }
    w.sockets.add(socket);
    if (w.welcome) socket.send(w.welcome);
    socket.send(w.status ?? JSON.stringify({ t: "wait", msg: "Waiting for the players…" }));
    socket.onMessage = (raw) => {
      try {
        const m = JSON.parse(raw) as Record<string, unknown>;
        if (m["t"] === "ping") socket.send(JSON.stringify({ t: "pong", c: m["c"] }));
      } catch {
        /* ignore */
      }
    };
    socket.onClose = () => {
      w.sockets.delete(socket);
    };
  };

  const allowOrigin = (origin: string | undefined) => {
    if (!origin) return false;
    try {
      const host = new URL(origin).hostname;
      return opts.allowedOrigins.some((o) => o === "*" || host === o || host.endsWith(`.${o}`));
    } catch {
      return false;
    }
  };

  const roomFor = (matchId: string): Promise<Room | null> => {
    const existing = rooms.get(matchId);
    if (existing) return Promise.resolve(existing);
    let p = opening.get(matchId);
    if (!p) {
      p = (async () => {
        const info = await opts.backend.matchInfo(matchId);
        if (!info || !["tennis", "racing", "athletics", "parkour"].includes(info.sport) || info.status !== "in_progress" || info.players.length !== 2) return null;
        const room: Room = info.sport === "tennis" ? new TennisRoom(info, opts.backend) : info.sport === "racing" ? new RaceRoom(info, opts.backend) : info.sport === "parkour" ? new ParkourRoom(info, opts.backend) : new AthleticsRoom(info, opts.backend);
        room.onDispose = () => {
          rooms.delete(matchId);
          const w = watchers.get(matchId);
          if (w) setTimeout(() => {
            for (const v of w.sockets) v.close(1000, "match over");
            watchers.delete(matchId);
          }, 15_000);
        };
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
    if (m["spectate"] === true) {
      const ok = rooms.has(m["match"]) && (await opts.backend.canSpectate?.(m["token"], m["match"]).catch(() => false));
      if (!ok || socket.closed) {
        socket.send(JSON.stringify({ t: "err", code: "CANNOT_WATCH" }));
        return socket.close(4403, "cannot watch");
      }
      return watch(m["match"], socket);
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
    if (seat === 0) teeSeat0(m["match"], socket);
    if (room instanceof TennisRoom) room.join(seat as 0 | 1, socket);
    else room.join(seat, socket);
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
