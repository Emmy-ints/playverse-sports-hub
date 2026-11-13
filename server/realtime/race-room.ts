/**
 * Authoritative 1v1 race room: the server runs the racing simulation; clients send only driving
 * input. Positions, lap times and the result are decided here and settled in the database.
 */
import { raceSnapshotOf } from "../../src/game/racing/net.ts";
import { applyCarInput, createRace, forceFinish, resetCar, sanitizeCarInput, stepRace, takeRaceEvents, type RaceState } from "../../src/game/racing/sim.ts";
import { buildTrack, TRACKS, type TrackDef } from "../../src/game/racing/track.ts";
import type { Backend, MatchInfo } from "./backend.ts";
import { ROOM_TIMING } from "./tennis-room.ts";
import type { Socket } from "./ws.ts";

const TICK_MS = 1000 / 60;

interface Seat { userId: string; name: string; avatar: unknown; socket: Socket | null; leftAt: number | null; bucket: number; bucketAt: number }

function trackFor(id: string): TrackDef["id"] {
  let h = 7;
  for (const c of id) h = (h * 33 + c.charCodeAt(0)) >>> 0;
  const ids = Object.keys(TRACKS) as TrackDef["id"][];
  return ids[h % ids.length]!;
}

export class RaceRoom {
  readonly matchId: string;
  private seats: Seat[];
  private s: RaceState;
  private status: "waiting" | "playing" | "paused" | "ended" = "waiting";
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = performance.now();
  private tickN = 0;
  private createdAt = Date.now();
  private settled = false;
  private forfeited = false;
  private maxTime: number;
  private backend: Backend;
  onDispose: () => void = () => {};

  constructor(info: MatchInfo, backend: Backend) {
    this.backend = backend;
    this.matchId = info.id;
    this.seats = [...info.players].sort((a, b) => a.slot - b.slot).map((p) => ({ userId: p.id, name: p.name, avatar: p.avatar, socket: null, leftAt: null, bucket: 60, bucketAt: Date.now() }));
    const laps = info.config.length === 3 || info.config.length === 5 ? info.config.length : 1;
    const track = trackFor(info.id);
    this.s = createRace(track, 2, laps);
    // Hard time limit so a race can't stall forever (≈ 3× a slow lap per lap, plus the countdown).
    this.maxTime = this.s.startAt + laps * (buildTrack(track).length / 12) + 60;
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  seatOf(userId: string): number {
    return this.seats.findIndex((s) => s.userId === userId);
  }

  join(p: number, socket: Socket) {
    const seat = this.seats[p]!;
    if (seat.socket && seat.socket !== socket) seat.socket.close(4000, "replaced");
    seat.socket = socket;
    seat.leftAt = null;
    socket.onMessage = (m) => this.message(p, socket, m);
    socket.onClose = () => this.leave(p, socket);
    socket.send(JSON.stringify({ t: "welcome", sport: "racing", you: p, ids: this.seats.map((s) => s.userId), names: this.seats.map((s) => s.name), avatars: this.seats.map((s) => s.avatar), laps: this.s.laps, track: this.s.trackId }));
    socket.send(JSON.stringify({ t: "s", st: raceSnapshotOf(this.s) }));
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
    if (this.status !== "playing") return;
    if (m["t"] === "in") {
      const input = sanitizeCarInput(m);
      if (input) applyCarInput(this.s, p, input);
    } else if (m["t"] === "reset") {
      resetCar(this.s, p);
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
    stepRace(this.s, dt);
    if (this.s.phase === "racing" && this.s.t > this.maxTime) forceFinish(this.s);
    const events = takeRaceEvents(this.s);
    if (events.length) this.broadcast({ t: "ev", e: events });
    if (++this.tickN % 2 === 0 || events.length) this.broadcast({ t: "s", st: raceSnapshotOf(this.s) });
    if (this.s.phase === "finished") void this.finish();
  }

  private forfeit(loser: number) {
    this.forfeited = true;
    forceFinish(this.s, loser);
    this.broadcast({ t: "ev", e: takeRaceEvents(this.s) });
    void this.finish();
  }

  private sendEnd(socket: Socket | null) {
    socket?.send(JSON.stringify({
      t: "end", order: this.s.finishOrder, times: this.s.cars.map((c) => (c.finished ? c.finishTime : null)), best: this.s.cars.map((c) => c.bestLap),
      forfeit: this.forfeited, saved: this.settled,
    }));
  }

  private async finish() {
    if (this.status === "ended") return;
    this.status = "ended";
    this.broadcast({ t: "s", st: raceSnapshotOf(this.s) });
    const winner = this.s.finishOrder[0];
    if (winner !== undefined) {
      const results: Record<string, unknown> = {};
      this.s.cars.forEach((c, i) => {
        results[this.seats[i]!.userId] = { position: this.s.finishOrder.indexOf(i) + 1, time: c.finished ? Math.round(c.finishTime * 1000) / 1000 : null, best_lap: c.bestLap ? Math.round(c.bestLap * 1000) / 1000 : null };
      });
      for (let attempt = 0; attempt < 4 && !this.settled; attempt++) {
        try {
          await this.backend.settleRacing(this.matchId, this.seats[winner]!.userId, { track: this.s.trackId, laps: this.s.laps, results }, this.forfeited);
          this.settled = true;
        } catch (e) {
          console.error("[racing] settle failed", this.matchId, e);
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
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
