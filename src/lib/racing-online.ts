/**
 * Online racing client: connects to the real-time game server, sends driving input and mirrors the
 * server's race for drawing. Positions, lap times and results are decided by the server.
 */
import type { LocalCarInput, RaceDriver } from "@/game/racing/driver";
import { applyRaceSnapshot, extrapolateRace, type RaceServerMessage } from "@/game/racing/net";
import { createRace, type RaceEvent, type RaceState } from "@/game/racing/sim";
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
  onMeta: (m: RaceMeta) => void = () => {};
  onEnd: (e: RaceEnd) => void = () => {};
  onFatal: (msg: string) => void = () => {};
  private readonly matchId: string;

  constructor(matchId: string) {
    this.matchId = matchId;
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
      ws.send(JSON.stringify({ t: "join", match: this.matchId, token }));
      this.statusText = "Joining the race…";
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
      case "s":
        applyRaceSnapshot(this.s, m.st);
        this.seq = Math.max(this.seq, m.st.c[this.viewer]?.lastSeq ?? 0);
        break;
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

  update(dt: number) {
    if (this.playing) extrapolateRace(this.s, dt);
    const now = performance.now();
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN && this.playing) {
      if (this.resetWanted) {
        this.resetWanted = false;
        ws.send(JSON.stringify({ t: "reset" }));
      }
      if (now - this.lastSend > 33) {
        this.lastSend = now;
        ws.send(JSON.stringify({ t: "in", seq: ++this.seq, ...this.pending }));
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
