/**
 * Authoritative tennis room: the server owns the simulation. Clients only send movement intent and
 * armed shots; every bounce, point and the final result are decided here and written to the
 * database through the secret-protected settle function.
 */
import { formatFromConfig } from "../../src/game/tennis/scoring.ts";
import { applyInput, createMatch, forfeit, sanitizeInput, step, takeEvents, type TennisState } from "../../src/game/tennis/sim.ts";
import { snapshotOf } from "../../src/game/tennis/net.ts";
import { COURT_THEMES, type CourtTheme } from "../../src/game/tennis/themes.ts";
import type { Backend, MatchInfo } from "./backend.ts";
import type { Socket } from "./ws.ts";

const TICK_MS = 1000 / 60;
const SNAPSHOT_EVERY = 2; // 30 Hz
/** Timings (seconds); adjustable for tests. */
export const ROOM_TIMING = { startDelay: 3, reconnectGrace: 30, noShow: 120 };

interface Seat { userId: string; name: string; avatar: unknown; socket: Socket | null; leftAt: number | null; bucket: number; bucketAt: number }

function themeFor(id: string): CourtTheme {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const list = Object.values(COURT_THEMES);
  return list[h % list.length]!;
}

export class TennisRoom {
  readonly matchId: string;
  private seats: [Seat, Seat];
  private s: TennisState;
  private theme: CourtTheme;
  private status: "waiting" | "countdown" | "playing" | "paused" | "ended" = "waiting";
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private tickN = 0;
  private startAt = 0;
  private createdAt = Date.now();
  private settled = false;
  onDispose: () => void = () => {};

  private backend: Backend;

  constructor(info: MatchInfo, backend: Backend) {
    this.backend = backend;
    this.matchId = info.id;
    const ps = [...info.players].sort((a, b) => a.slot - b.slot);
    const seat = (i: number): Seat => ({ userId: ps[i]!.id, name: ps[i]!.name, avatar: ps[i]!.avatar, socket: null, leftAt: null, bucket: 60, bucketAt: Date.now() });
    this.seats = [seat(0), seat(1)];
    this.theme = themeFor(info.id);
    const seed = parseInt(info.id.replace(/-/g, "").slice(0, 8), 16) >>> 0;
    this.s = createMatch(formatFromConfig(info.config), this.theme.surface, (seed & 1) as 0 | 1, seed);
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.last = performance.now();
  }

  seatOf(userId: string): 0 | 1 | -1 {
    return this.seats[0].userId === userId ? 0 : this.seats[1].userId === userId ? 1 : -1;
  }

  join(p: 0 | 1, socket: Socket) {
    const seat = this.seats[p];
    if (seat.socket && seat.socket !== socket) seat.socket.close(4000, "replaced"); // newer tab wins
    seat.socket = socket;
    seat.leftAt = null;
    socket.onMessage = (m) => this.message(p, socket, m);
    socket.onClose = () => this.leave(p, socket);
    socket.send(JSON.stringify({
      t: "welcome", you: p, ids: [this.seats[0].userId, this.seats[1].userId], names: [this.seats[0].name, this.seats[1].name], avatars: [this.seats[0].avatar, this.seats[1].avatar],
      format: this.s.format, theme: this.theme.id,
    }));
    socket.send(JSON.stringify({ t: "s", st: snapshotOf(this.s) }));
    if (this.status === "ended") {
      this.sendEnd(socket, false);
      return;
    }
    if (this.seats[0].socket && this.seats[1].socket) {
      if (this.status === "waiting" || this.status === "paused") {
        this.status = "countdown";
        this.startAt = performance.now() + ROOM_TIMING.startDelay * 1000;
        this.broadcast({ t: "wait", msg: "Match starting…", until: ROOM_TIMING.startDelay });
      }
    } else {
      this.broadcast({ t: "wait", msg: `Waiting for ${this.seats[p === 0 ? 1 : 0].name} to connect…` });
    }
  }

  private leave(p: 0 | 1, socket: Socket) {
    const seat = this.seats[p];
    if (seat.socket !== socket) return;
    seat.socket = null;
    seat.leftAt = performance.now();
    if (this.status === "ended") return;
    if (this.status === "playing" || this.status === "countdown") this.status = "paused";
    this.broadcast({ t: "wait", msg: `${seat.name} disconnected — waiting ${ROOM_TIMING.reconnectGrace}s for them to come back`, until: ROOM_TIMING.reconnectGrace });
  }

  private message(p: 0 | 1, socket: Socket, raw: string) {
    const seat = this.seats[p];
    // Token bucket: 60 messages/second sustained, bursts up to 60.
    const now = Date.now();
    seat.bucket = Math.min(60, seat.bucket + ((now - seat.bucketAt) / 1000) * 60);
    seat.bucketAt = now;
    if (seat.bucket < 1) return;
    seat.bucket -= 1;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (m["t"] === "ping") return socket.send(JSON.stringify({ t: "pong", c: m["c"] }));
    if (m["t"] === "in" && this.status === "playing") {
      const input = sanitizeInput(m);
      if (input) applyInput(this.s, p, input);
    }
  }

  private broadcast(msg: unknown) {
    const text = JSON.stringify(msg);
    for (const seat of this.seats) seat.socket?.send(text);
  }

  private tick() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.status === "waiting") {
      if ((Date.now() - this.createdAt) / 1000 > ROOM_TIMING.noShow) {
        const present = this.seats.findIndex((s) => s.socket);
        if (present < 0) return this.dispose();
        this.finishByForfeit((present === 0 ? 1 : 0) as 0 | 1);
      }
      return;
    }
    if (this.status === "paused") {
      for (const p of [0, 1] as const) {
        const seat = this.seats[p];
        if (!seat.socket && seat.leftAt !== null && (now - seat.leftAt) / 1000 > ROOM_TIMING.reconnectGrace) {
          if (!this.seats[p === 0 ? 1 : 0].socket) return this.dispose(); // both gone: leave it unsettled
          return this.finishByForfeit(p);
        }
      }
      return;
    }
    if (this.status === "countdown") {
      if (now >= this.startAt) {
        this.status = "playing";
        this.broadcast({ t: "go" });
      }
      return;
    }
    if (this.status !== "playing") return;
    step(this.s, dt);
    const events = takeEvents(this.s);
    if (events.length) this.broadcast({ t: "ev", e: events });
    if (++this.tickN % SNAPSHOT_EVERY === 0 || events.length) this.broadcast({ t: "s", st: snapshotOf(this.s) });
    if (this.s.phase === "matchOver") void this.finish(false);
  }

  private finishByForfeit(loser: 0 | 1) {
    forfeit(this.s, loser);
    this.broadcast({ t: "ev", e: takeEvents(this.s) });
    void this.finish(true);
  }

  private sendEnd(socket: Socket | null, forfeitFlag: boolean) {
    const msg = JSON.stringify({ t: "end", winner: this.s.score.winner, score: this.s.score, stats: this.s.stats, forfeit: forfeitFlag, saved: this.settled });
    socket?.send(msg);
  }

  private async finish(forfeited: boolean) {
    if (this.status === "ended") return;
    this.status = "ended";
    this.broadcast({ t: "s", st: snapshotOf(this.s) });
    const w = this.s.score.winner;
    if (w !== null) {
      const stats = { [this.seats[0].userId]: this.s.stats[0], [this.seats[1].userId]: this.s.stats[1] };
      const score = { sets: this.s.score.sets, history: this.s.score.history, games: this.s.score.games };
      for (let attempt = 0; attempt < 4 && !this.settled; attempt++) {
        try {
          await this.backend.settleTennis(this.matchId, this.seats[w].userId, score, stats, forfeited);
          this.settled = true;
        } catch (e) {
          console.error("[tennis] settle failed", this.matchId, e);
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
    }
    for (const seat of this.seats) this.sendEnd(seat.socket, forfeited);
    setTimeout(() => this.dispose(), 60_000);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const seat of this.seats) seat.socket?.close(1000, "room closed");
    this.onDispose();
  }
}
