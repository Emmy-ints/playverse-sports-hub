/**
 * Authoritative online athletics: both players run in the same simulated event (with AI athletes
 * filling the other lanes); the server owns every stride, take-off, mark and placing, scores the
 * championship and settles the result in the database.
 */
import { eventSnapshot, FIELD_SIZE, HUMANS } from "../../src/game/athletics/net.ts";
import { aiEvent, applyEventInput, createEvent, EVENT_ORDER, PLACE_POINTS, placings, stepEvent, takeEventEvents, type EventId, type EventState, type Key } from "../../src/game/athletics/sim.ts";
import type { Backend, MatchInfo } from "./backend.ts";
import { ROOM_TIMING } from "./tennis-room.ts";
import type { Socket } from "./ws.ts";

const TICK_MS = 1000 / 60;
const AI_SKILLS = [0.82, 0.7, 0.6, 0.5];
const INTERMISSION = 7;

interface Seat { userId: string; name: string; avatar: unknown; socket: Socket | null; leftAt: number | null; bucket: number; bucketAt: number }

export class AthleticsRoom {
  readonly matchId: string;
  private seats: Seat[];
  private events: EventId[];
  private idx = 0;
  private s: EventState;
  private points = [0, 0];
  private results: Record<string, Record<string, number | null>> = {};
  private status: "waiting" | "playing" | "paused" | "intermission" | "ended" = "waiting";
  private nextAt = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = performance.now();
  private tickN = 0;
  private aiSeq = 1_000_000;
  private createdAt = Date.now();
  private settled = false;
  private forfeited = false;
  private seed: number;
  private backend: Backend;
  onDispose: () => void = () => {};

  constructor(info: MatchInfo, backend: Backend) {
    this.backend = backend;
    this.matchId = info.id;
    this.seats = [...info.players].sort((a, b) => a.slot - b.slot).map((p) => ({ userId: p.id, name: p.name, avatar: p.avatar, socket: null, leftAt: null, bucket: 80, bucketAt: Date.now() }));
    const mode = String(info.config.mode ?? "championship");
    this.events = mode === "championship" ? [...EVENT_ORDER] : (EVENT_ORDER.includes(mode as EventId) ? [mode as EventId] : ["sprint100"]);
    this.seed = parseInt(info.id.replace(/-/g, "").slice(0, 8), 16) >>> 0;
    this.s = createEvent(this.events[0]!, FIELD_SIZE, this.seed);
    this.seats.forEach((s) => (this.results[s.userId] = {}));
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  seatOf(userId: string): number {
    return this.seats.findIndex((s) => s.userId === userId);
  }

  private meta(p: number) {
    return { t: "welcome", sport: "athletics", you: p, ids: this.seats.map((s) => s.userId), names: this.seats.map((s) => s.name), avatars: this.seats.map((s) => s.avatar), events: this.events };
  }

  join(p: number, socket: Socket) {
    const seat = this.seats[p]!;
    if (seat.socket && seat.socket !== socket) seat.socket.close(4000, "replaced");
    seat.socket = socket;
    seat.leftAt = null;
    socket.onMessage = (m) => this.message(p, socket, m);
    socket.onClose = () => this.leave(p, socket);
    socket.send(JSON.stringify(this.meta(p)));
    socket.send(JSON.stringify({ t: "s", st: eventSnapshot(this.s), idx: this.idx, points: this.points }));
    if (this.status === "ended") return this.sendEnd(socket);
    if (this.seats.every((s) => s.socket)) {
      if (this.status === "waiting" || this.status === "paused") {
        this.status = "playing";
        this.last = performance.now();
        this.broadcast({ t: "go" });
      }
    } else {
      const other = this.seats.find((s) => !s.socket);
      this.broadcast({ t: "wait", msg: `Waiting for ${other?.name ?? "your opponent"} to connect…` });
    }
  }

  private leave(p: number, socket: Socket) {
    const seat = this.seats[p]!;
    if (seat.socket !== socket) return;
    seat.socket = null;
    seat.leftAt = performance.now();
    if (this.status === "ended") return;
    if (this.status === "playing" || this.status === "intermission") this.status = "paused";
    this.broadcast({ t: "wait", msg: `${seat.name} disconnected — waiting ${ROOM_TIMING.reconnectGrace}s for them to come back`, until: ROOM_TIMING.reconnectGrace });
  }

  private message(p: number, socket: Socket, raw: string) {
    const seat = this.seats[p]!;
    const now = Date.now();
    seat.bucket = Math.min(80, seat.bucket + ((now - seat.bucketAt) / 1000) * 40); // tapping is fast: 40/s sustained
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
    if (m["t"] !== "in" || this.status !== "playing") return;
    const key = m["key"];
    if (key !== "L" && key !== "R" && key !== "A") return;
    const seq = typeof m["seq"] === "number" && Number.isFinite(m["seq"]) ? Math.floor(m["seq"]) : -1;
    applyEventInput(this.s, p, { seq, key: key as Key, down: m["down"] === true });
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
        return this.forfeit(present === 0 ? 1 : 0);
      }
      return;
    }
    if (this.status === "paused") {
      for (let p = 0; p < this.seats.length; p++) {
        const seat = this.seats[p]!;
        if (!seat.socket && seat.leftAt !== null && (now - seat.leftAt) / 1000 > ROOM_TIMING.reconnectGrace) {
          if (this.seats.every((s) => !s.socket)) return this.dispose();
          return this.forfeit(p);
        }
      }
      return;
    }
    if (this.status === "intermission") {
      if (now >= this.nextAt) {
        this.idx++;
        this.s = createEvent(this.events[this.idx]!, FIELD_SIZE, this.seed + this.idx * 977);
        this.status = "playing";
        this.broadcast({ t: "next", idx: this.idx, event: this.events[this.idx], points: this.points });
        this.broadcast({ t: "s", st: eventSnapshot(this.s), idx: this.idx, points: this.points });
      }
      return;
    }
    if (this.status !== "playing") return;
    for (let i = HUMANS; i < this.s.athletes.length; i++) {
      const e = aiEvent(this.s, i, AI_SKILLS[i - HUMANS] ?? 0.6, ++this.aiSeq);
      if (e) applyEventInput(this.s, i, e);
    }
    stepEvent(this.s, dt);
    const events = takeEventEvents(this.s);
    if (events.length) this.broadcast({ t: "ev", e: events });
    if (++this.tickN % 3 === 0 || events.some((e) => e.kind !== "step")) this.broadcast({ t: "s", st: eventSnapshot(this.s), idx: this.idx, points: this.points });
    if (this.s.phase === "over") this.eventOver(now);
  }

  private eventOver(now: number) {
    const order = placings(this.s);
    for (let p = 0; p < HUMANS; p++) {
      this.points[p]! += PLACE_POINTS[order.indexOf(p)] ?? 0;
      this.results[this.seats[p]!.userId]![this.s.event] = this.s.athletes[p]!.finish;
    }
    if (this.idx + 1 < this.events.length) {
      this.status = "intermission";
      this.nextAt = now + INTERMISSION * 1000;
      this.broadcast({ t: "s", st: eventSnapshot(this.s), idx: this.idx, points: this.points });
    } else {
      void this.finish();
    }
  }

  private winner(): number {
    if (this.points[0] !== this.points[1]) return this.points[0]! > this.points[1]! ? 0 : 1;
    const order = placings(this.s); // tie: better placing in the last event
    return order.indexOf(0) < order.indexOf(1) ? 0 : 1;
  }

  private forfeit(loser: number) {
    this.forfeited = true;
    this.points[loser] = -1;
    void this.finish(loser === 0 ? 1 : 0);
  }

  private sendEnd(socket: Socket | null) {
    socket?.send(JSON.stringify({ t: "end", points: this.points, winner: this.forfeited ? (this.points[0]! < 0 ? 1 : 0) : this.winner(), forfeit: this.forfeited, saved: this.settled }));
  }

  private async finish(forcedWinner?: number) {
    if (this.status === "ended") return;
    this.status = "ended";
    const w = forcedWinner ?? this.winner();
    const players: Record<string, unknown> = {};
    this.seats.forEach((s, p) => (players[s.userId] = { points: Math.max(0, this.points[p]!), ...this.results[s.userId] }));
    for (let attempt = 0; attempt < 4 && !this.settled; attempt++) {
      try {
        await this.backend.settleAthletics(this.matchId, this.seats[w]!.userId, { events: this.events, players }, this.forfeited);
        this.settled = true;
      } catch (e) {
        console.error("[athletics] settle failed", this.matchId, e);
        await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      }
    }
    for (const seat of this.seats) this.sendEnd(seat.socket);
    setTimeout(() => this.dispose(), 60_000);
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const seat of this.seats) seat.socket?.close(1000, "room closed");
    this.onDispose();
  }
}
