/**
 * Online tennis client: connects to the PLAYVERSE real-time game server over WebSocket, sends
 * movement and armed shots, and mirrors the server's authoritative state for drawing. It never
 * decides points or results — those come from the server.
 */
import type { LocalInput, TennisDriver } from "@/game/tennis/driver";
import { applySnapshot, extrapolate, mirrorState, type ServerMessage } from "@/game/tennis/net";
import type { MatchFormat, Score } from "@/game/tennis/scoring";
import type { PlayerStats, TennisEvent, TennisState } from "@/game/tennis/sim";
import type { AvatarConfig } from "./avatar";
import { getSupabase } from "./supabase";

/** Public address of the game server (not a secret). */
export const REALTIME_URL: string = import.meta.env["VITE_REALTIME_URL"] ?? "https://playverse-realtime.onrender.com";

export function warmRealtimeServer() {
  if (typeof window === "undefined") return;
  fetch(`${REALTIME_URL}/health`, { cache: "no-store" }).catch(() => {});
}

export async function startRealtimeMatch(matchId: string) {
  const sb = getSupabase();
  if (!sb) throw new Error("Not available");
  warmRealtimeServer();
  const { error } = await sb.rpc("start_realtime_match", { match: matchId });
  if (error) throw new Error(error.message);
}

export interface OnlineMeta {
  you: 0 | 1;
  ids: [string, string];
  names: [string, string];
  avatars: [AvatarConfig | null, AvatarConfig | null];
  format: MatchFormat;
  theme: string;
}

export interface OnlineEnd { winner: 0 | 1 | null; score: Score; stats: [PlayerStats, PlayerStats]; forfeit: boolean; saved: boolean }

const FATAL: Record<string, string> = {
  UNAUTHORIZED: "Please sign in again to play online.",
  MATCH_UNAVAILABLE: "This match isn't live on the game server (it may have finished).",
  NOT_IN_MATCH: "You're not a player in this match.",
};

export class OnlineTennisDriver implements TennisDriver {
  viewer: 0 | 1 = 0;
  private ws: WebSocket | null = null;
  private s: TennisState = mirrorState({ bestOf: 1, gamesPerSet: 4 });
  private events: TennisEvent[] = [];
  private seq = 0;
  private lastSend = 0;
  private pending: LocalInput = { mx: 0, mz: 0, sprint: false, shot: null };
  private statusText: string | null = "Connecting to the game server…";
  private playing = false;
  private ended = false;
  private fatal = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private connectStarted = 0;
  rtt = 0;
  onMeta: (m: OnlineMeta) => void = () => {};
  onEnd: (e: OnlineEnd) => void = () => {};
  onFatal: (msg: string) => void = () => {};
  private readonly matchId: string;

  constructor(matchId: string) {
    this.matchId = matchId;
    this.connect();
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
    this.connectStarted = Date.now();
    const url = REALTIME_URL.replace(/^http/, "ws") + "/play";
    const ws = new WebSocket(url);
    this.ws = ws;
    const slow = setTimeout(() => {
      if (ws.readyState === WebSocket.CONNECTING) this.statusText = "Waking up the game server — this can take up to a minute after a quiet period…";
    }, 4000);
    ws.onopen = () => {
      clearTimeout(slow);
      this.retries = 0;
      ws.send(JSON.stringify({ t: "join", match: this.matchId, token }));
      this.statusText = "Joining the match…";
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
      const wait = Math.min(5000, 800 * 2 ** Math.min(this.retries, 3));
      this.statusText = this.retries > 1 ? "Connection lost — reconnecting…" : "Reconnecting…";
      this.retryTimer = setTimeout(() => void this.connect(), Date.now() - this.connectStarted > 60000 ? wait : Math.max(wait, 2000));
    };
  }

  private message(raw: string) {
    let m: ServerMessage;
    try {
      m = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    switch (m.t) {
      case "welcome": {
        this.viewer = m.you;
        this.s = mirrorState(m.format);
        this.onMeta({ you: m.you, ids: m.ids, names: m.names, avatars: m.avatars as [AvatarConfig | null, AvatarConfig | null], format: m.format, theme: m.theme });
        break;
      }
      case "s":
        applySnapshot(this.s, m.st);
        this.seq = Math.max(this.seq, m.st.p[this.viewer]?.ls ?? 0); // after a reload, continue the server's sequence
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
        this.statusText = m.saved ? null : "Result could not be saved — the server will retry.";
        this.onEnd(m);
        break;
      case "err": {
        this.fatal = true;
        this.onFatal(FATAL[m.code] ?? "The game server refused the connection.");
        break;
      }
      case "pong":
        this.rtt = Math.round(performance.now() - m.c);
        break;
    }
  }

  state() {
    return this.s;
  }

  input(i: LocalInput) {
    this.pending = { ...i, shot: this.playing ? (i.shot ?? this.pending.shot ?? null) : null };
  }

  update(dt: number) {
    if (this.playing) extrapolate(this.s, dt);
    const now = performance.now();
    const ws = this.ws;
    if (ws && ws.readyState === WebSocket.OPEN && this.playing && (this.pending.shot || now - this.lastSend > 33)) {
      this.lastSend = now;
      ws.send(JSON.stringify({ t: "in", seq: ++this.seq, ...this.pending }));
      this.pending = { ...this.pending, shot: null };
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
