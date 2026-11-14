/**
 * Online racing client: connects to the real-time game server, sends driving input and mirrors the
 * server's race for drawing. Positions, lap times and results are decided by the server.
 */
import type { LocalCarInput, RaceDriver } from "@/game/racing/driver";
import { applyRaceSnapshot, extrapolateRace, type RaceServerMessage } from "@/game/racing/net";
import { applyCarInput, createRace, stepRace, type CarState, type RaceEvent, type RaceState } from "@/game/racing/sim";
import type { TrackDef } from "@/game/racing/track";
import type { AvatarConfig } from "./avatar";
import { getSupabase } from "./supabase";
import { REALTIME_URL } from "./tennis-online";

export interface RaceMeta { you: number; ids: string[]; names: string[]; avatars: (AvatarConfig | null)[]; laps: number; track: TrackDef["id"] }
export interface RaceEnd { order: number[]; times: (number | null)[]; best: number[]; forfeit: boolean; saved: boolean }

const FATAL: Record<string, string> = {
  UNAUTHORIZED: "Please sign in again to race online.",
  MATCH_UNAVAILABLE: "This race isn't live on the game server (it may have finished).",
  NOT_IN_MATCH: "You're not a driver in this race.",
  CANNOT_WATCH: "You can watch live races of your friends only, while they're still running.",
};

export class OnlineRaceDriver implements RaceDriver {
  viewer = 0;
  private ws: WebSocket | null = null;
  private s: RaceState = createRace("city", 2, 1);
  private events: RaceEvent[] = [];
  private seq = 0;
  private lastSend = 0;
  private pending: LocalCarInput = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  private resetWanted = false;
  private statusText: string | null = "Connecting to the game server…";
  private playing = false;
  private ended = false;
  private fatal = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  rtt = 0;
  /** Unconfirmed inputs and how long each was held, replayed on top of server snapshots. */
  private history: { seq: number; input: LocalCarInput; dur: number }[] = [];
  private scratch: RaceState | null = null;
  private smooth = { x: 0, z: 0, h: 0 };
  onMeta: (m: RaceMeta) => void = () => {};
  onEnd: (e: RaceEnd) => void = () => {};
  onFatal: (msg: string) => void = () => {};
  private readonly matchId: string;
  /** Read-only: receive the race from the first driver's seat; inputs are never sent. */
  readonly spectate: boolean;

  constructor(matchId: string, opts: { spectate?: boolean } = {}) {
    this.matchId = matchId;
    this.spectate = !!opts.spectate;
    void this.connect();
  }

  private async connect() {
    if (this.ended || this.fatal) return;
    const sb = getSupabase();
    const { data } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const token = data.session?.access_token;
    if (!token) {
      this.fatal = true;
      this.onFatal(FATAL["UNAUTHORIZED"]!);
      return;
    }
    const ws = new WebSocket(REALTIME_URL.replace(/^http/, "ws") + "/play");
    this.ws = ws;
    const slow = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) this.statusText = "Waking up the game server — this can take up to a minute after a quiet period…";
    }, 4000);
    ws.onopen = () => {
      clearTimeout(slow);
      this.retries = 0;
      ws.send(JSON.stringify({ t: "join", match: this.matchId, token, ...(this.spectate ? { spectate: true } : {}) }));
      this.statusText = this.spectate ? "Joining as a spectator…" : "Joining the race…";
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "ping", c: performance.now() })), 2000);
    };
    ws.onmessage = (e) => this.message(String(e.data));
    ws.onclose = () => {
      clearTimeout(slow);
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      this.playing = false;
      if (this.ended || this.fatal) return;
      this.retries++;
      this.statusText = "Connection lost — reconnecting…";
      this.retryTimer = setTimeout(() => void this.connect(), Math.min(5000, 800 * 2 ** Math.min(this.retries, 3)));
    };
  }

  private message(raw: string) {
    let m: RaceServerMessage;
    try {
      m = JSON.parse(raw) as RaceServerMessage;
    } catch {
      return;
    }
    switch (m.t) {
      case "welcome":
        this.viewer = m.you;
        this.s = createRace(m.track as TrackDef["id"], m.names.length, m.laps);
        this.onMeta({ you: m.you, ids: m.ids, names: m.names, avatars: m.avatars as (AvatarConfig | null)[], laps: m.laps, track: m.track as TrackDef["id"] });
        break;
      case "s": {
        const prev = this.s.cars[this.viewer] ? { x: this.s.cars[this.viewer]!.x, z: this.s.cars[this.viewer]!.z, h: this.s.cars[this.viewer]!.h } : null;
        applyRaceSnapshot(this.s, m.st);
        const ack = m.st.c[this.viewer]?.lastSeq ?? 0;
        this.seq = Math.max(this.seq, ack);
        this.reconcile(ack, prev);
        break;
      }
      case "ev":
        this.events.push(...m.e);
        break;
      case "wait":
        this.playing = false;
        this.statusText = m.msg;
        break;
      case "go":
        this.playing = true;
        this.statusText = null;
        break;
      case "end":
        this.ended = true;
        this.playing = false;
        this.statusText = null;
        this.onEnd(m);
        break;
      case "err":
        this.fatal = true;
        this.onFatal(FATAL[m.code] ?? "The game server refused the connection.");
        break;
      case "pong":
        this.rtt = Math.round(performance.now() - m.c);
        break;
    }
  }

  state() {
    return this.s;
  }

  input(i: LocalCarInput) {
    this.pending = i;
  }

  reset() {
    this.resetWanted = true;
  }

  /** One-car scratch race used to run the real car physics locally for prediction. */
  private scratchFor(car: CarState) {
    if (!this.scratch) this.scratch = createRace(this.s.trackId, 1, this.s.laps);
    const sc = this.scratch;
    sc.t = this.s.t;
    sc.phase = this.s.phase === "racing" ? "racing" : this.s.phase;
    sc.startAt = this.s.startAt;
    sc.finishOrder = [];
    sc.events = [];
    sc.cars[0] = { ...car, input: { ...car.input }, lastSeq: -1 };
    return sc;
  }

  private reconcile(ack: number, prev: { x: number; z: number; h: number } | null) {
    const me = this.s.cars[this.viewer];
    if (this.spectate || !me || this.s.phase !== "racing" || me.finished) return;
    this.history = this.history.filter((h) => h.seq > ack);
    const sc = this.scratchFor(me);
    let seq = 0;
    for (const h of this.history) {
      applyCarInput(sc, 0, { ...h.input, seq: ++seq });
      if (h.dur > 0) stepRace(sc, h.dur);
    }
    const p = sc.cars[0]!;
    if (prev) {
      let dh = prev.h - p.h;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      this.smooth = { x: prev.x - p.x, z: prev.z - p.z, h: dh };
      if (Math.hypot(this.smooth.x, this.smooth.z) > 6) this.smooth = { x: 0, z: 0, h: 0 };
    }
    Object.assign(me, { ...p, input: me.input, lastSeq: me.lastSeq, x: p.x + this.smooth.x, z: p.z + this.smooth.z, h: p.h + this.smooth.h });
    this.predicted = { ...p };
  }

  private predicted: CarState | null = null;

  update(dt: number) {
    if (this.playing) extrapolateRace(this.s, dt);
    // Local prediction: run the real car physics for your own car with your current input.
    const me = this.s.cars[this.viewer];
    if (this.playing && me && this.predicted && this.s.phase === "racing" && !me.finished) {
      const last = this.history[this.history.length - 1];
      if (last) last.dur += dt;
      const sc = this.scratchFor(this.predicted);
      applyCarInput(sc, 0, { ...this.pending, seq: 1 });
      stepRace(sc, Math.min(dt, 1 / 20));
      const p = sc.cars[0]!;
      this.predicted = { ...p };
      const k = Math.exp(-dt * 6);
      this.smooth = { x: this.smooth.x * k, z: this.smooth.z * k, h: this.smooth.h * k };
      Object.assign(me, { ...p, input: { ...me.input, ...this.pending }, lastSeq: me.lastSeq, lap: me.lap, s: me.s, progress: me.progress, finished: me.finished, bestLap: me.bestLap,
        x: p.x + this.smooth.x, z: p.z + this.smooth.z, h: p.h + this.smooth.h });
    }
    const now = performance.now();
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN && this.playing && !this.spectate) {
      if (this.resetWanted) {
        this.resetWanted = false;
        ws.send(JSON.stringify({ t: "reset" }));
      }
      if (now - this.lastSend > 33) {
        this.lastSend = now;
        const seq = ++this.seq;
        ws.send(JSON.stringify({ t: "in", seq, ...this.pending }));
        this.history.push({ seq, input: { ...this.pending }, dur: 0 });
        if (this.history.length > 150) this.history.shift();
      }
    }
    const ev = this.events;
    this.events = [];
    return ev;
  }

  status() {
    if (this.statusText) return this.statusText;
    return this.rtt > 180 ? `High latency (${this.rtt} ms)` : null;
  }

  destroy() {
    this.ended = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}
