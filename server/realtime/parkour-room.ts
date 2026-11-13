/**
 * Authoritative online Rooftop Rush: both players race the same seeded rooftop course (with two
 * computer runners), the server owns every jump, slide, fall and finish time, and settles the result.
 */
import { FIELD_SIZE, HUMANS, raceSnapshot } from "../../src/game/parkour/net.ts";
import { aiInput, applyInput, createRace, LENGTHS, placings, stepRace, takeEvents, type CourseLength, type Key, type RaceState } from "../../src/game/parkour/sim.ts";
import type { Backend, MatchInfo } from "./backend.ts";
import { ROOM_TIMING } from "./tennis-room.ts";
import type { Socket } from "./ws.ts";

const TICK_MS = 1000 / 60;
const AI_SKILLS = [0.8, 0.6];

interface Seat { userId: string; name: string; avatar: unknown; socket: Socket | null; leftAt: number | null; bucket: number; bucketAt: number }

export class ParkourRoom {
  readonly matchId: string;
  private seats: Seat[];
  private s: RaceState;
  private seed: number;
  private length: number;
  private status: "waiting" | "playing" | "paused" | "ended" = "waiting";
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = performance.now();
  private tickN = 0;
  private aiSeq = 1_000_000;
  private createdAt = Date.now();
  private settled = false;
  private forfeited = false;
  private forcedWinner = -1;
  private backend: Backend;
  onDispose: () => void = () => {};

  constructor(info: MatchInfo, backend: Backend) {
    this.backend = backend;
    this.matchId = info.id;
    this.seats = [...info.players].sort((a, b) => a.slot - b.slot).map((p) => ({ userId: p.id, name: p.name, avatar: p.avatar, socket: null, leftAt: null, bucket: 60, bucketAt: Date.now() }));
    const mode = String(info.config.mode ?? "standard");
    const len = (mode in LENGTHS ? mode : "standard") as CourseLength;
    this.length = LENGTHS[len];
    this.seed = parseInt(info.id.replace(/-/g, "").slice(0, 8), 16) >>> 0;
    this.s = createRace(FIELD_SIZE, this.seed, this.length);
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  seatOf(userId: string): number {
    return this.seats.findIndex((s) => s.userId === userId);
  }

  private meta(p: number) {
    return { t: "welcome", sport: "parkour", you: p, ids: this.seats.map((s) => s.userId), names: this.seats.map((s) => s.name), avatars: this.seats.map((s) => s.avatar), seed: this.seed, length: this.length };
  }

  join(p: number, socket: Socket) {
    const seat = this.seats[p]!;
    if (seat.socket && seat.socket !== socket) seat.socket.close(4000, "replaced");
    seat.socket = socket;
    seat.leftAt = null;
    socket.onMessage = (m) => this.message(p, socket, m);
    socket.onClose = () => this.leave(p, socket);
    socket.send(JSON.stringify(this.meta(p)));
    socket.send(JSON.stringify({ t: "s", st: raceSnapshot(this.s) }));
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
    if (this.status === "playing") this.status = "paused";
    this.broadcast({ t: "wait", msg: `${seat.name} disconnected — waiting ${ROOM_TIMING.reconnectGrace}s for them to come back`, until: ROOM_TIMING.reconnectGrace });
  }

  private message(p: number, socket: Socket, raw: string) {
    const seat = this.seats[p]!;
    const now = Date.now();
    seat.bucket = Math.min(60, seat.bucket + ((now - seat.bucketAt) / 1000) * 25);
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
    if (key !== "J" && key !== "S" && key !== "L" && key !== "R") return;
    const seq = typeof m["seq"] === "number" && Number.isFinite(m["seq"]) ? Math.floor(m["seq"]) : -1;
    applyInput(this.s, p, { seq, key: key as Key, down: m["down"] === true });
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
    if (this.status !== "playing") return;
    for (let i = HUMANS; i < this.s.runners.length; i++) {
      const e = aiInput(this.s, i, AI_SKILLS[i - HUMANS] ?? 0.6, ++this.aiSeq);
      if (e) applyInput(this.s, i, e);
    }
    stepRace(this.s, dt);
    const events = takeEvents(this.s);
    if (events.length) this.broadcast({ t: "ev", e: events.filter((e) => e.kind !== "step") });
    if (++this.tickN % 3 === 0 || events.some((e) => e.kind !== "step")) this.broadcast({ t: "s", st: raceSnapshot(this.s) });
    // Both players are home (or the race timed out): settle.
    const bothDone = this.s.runners.slice(0, HUMANS).every((r) => r.finish !== null);
    if (bothDone || this.s.phase === "over") void this.finish();
  }

  private winner(): number {
    if (this.forcedWinner >= 0) return this.forcedWinner;
    const order = placings(this.s);
    return order.indexOf(0) < order.indexOf(1) ? 0 : 1;
  }

  private forfeit(loser: number) {
    this.forfeited = true;
    this.forcedWinner = loser === 0 ? 1 : 0;
    void this.finish();
  }

  private sendEnd(socket: Socket | null) {
    socket?.send(JSON.stringify({ t: "end", order: placings(this.s), times: this.s.runners.map((r) => r.finish), winner: this.winner(), forfeit: this.forfeited, saved: this.settled }));
  }

  private async finish() {
    if (this.status === "ended") return;
    this.status = "ended";
    // Let the AI runners finish visually on clients; results only concern the two players.
    const w = this.winner();
    const players: Record<string, unknown> = {};
    this.seats.forEach((s, p) => {
      const r = this.s.runners[p]!;
      players[s.userId] = { time: r.finish, place: placings(this.s).indexOf(p) + 1, falls: r.falls, hits: r.hits, best_combo: r.bestCombo };
    });
    for (let attempt = 0; attempt < 4 && !this.settled; attempt++) {
      try {
        await this.backend.settleParkour(this.matchId, this.seats[w]!.userId, { length: this.length, players }, this.forfeited);
        this.settled = true;
      } catch (e) {
        console.error("[parkour] settle failed", this.matchId, e);
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
