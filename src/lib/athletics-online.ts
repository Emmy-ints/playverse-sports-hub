/**
 * Online athletics client. Your taps are applied to a local copy of the event immediately (so the
 * runner reacts the instant you press), sent to the server, and replayed on top of every server
 * snapshot until the server confirms them. Every mark, time and placing is decided by the server.
 */
import type { AthleticsDriver } from "@/game/athletics/driver";
import { HUMANS, type AthleticsMeta, type AthleticsServerMessage } from "@/game/athletics/net";
import { aiEvent, applyEventInput, stepEvent, takeEventEvents, type EventEvent, type EventState, type Key } from "@/game/athletics/sim";
import type { AvatarConfig } from "./avatar";
import { getSupabase } from "./supabase";
import { REALTIME_URL } from "./tennis-online";

export interface AthleticsEnd { points: number[]; winner: number; forfeit: boolean; saved: boolean }

const FATAL: Record<string, string> = {
  UNAUTHORIZED: "Please sign in again to compete online.",
  MATCH_UNAVAILABLE: "This meeting isn't live on the game server (it may have finished).",
  NOT_IN_MATCH: "You're not an athlete in this meeting.",
  CANNOT_WATCH: "You can watch live meetings of your friends only, while they're still in play.",
};
const LOCAL_KINDS = new Set(["step", "wrong", "takeoff", "throw", "false_start"]);
const AI_SKILLS = [0.82, 0.7, 0.6, 0.5];

export class OnlineAthleticsDriver implements AthleticsDriver {
  viewer = 0;
  private ws: WebSocket | null = null;
  private s: EventState | null = null;
  private seq = 0;
  private aiSeq = 5_000_000;
  private pending: { seq: number; key: Key; down: boolean; at: number }[] = [];
  private events: EventEvent[] = [];
  private statusText: string | null = "Connecting to the game server…";
  private playing = false;
  private ended = false;
  private fatal = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  rtt = 150;
  idx = 0;
  points = [0, 0];
  onMeta: (m: AthleticsMeta & { avatars: (AvatarConfig | null)[] }) => void = () => {};
  onEventChange: (idx: number) => void = () => {};
  onEnd: (e: AthleticsEnd) => void = () => {};
  onFatal: (msg: string) => void = () => {};
  private readonly matchId: string;
  /** Read-only: follow the match from the first player's seat; inputs are never sent. */
  readonly spectate: boolean;

  constructor(matchId: string, opts: { spectate?: boolean } = {}) {
    this.matchId = matchId;
    this.spectate = !!opts.spectate;
    void this.connect();
  }

  private async connect() {
    if (this.ended || this.fatal) return;
    const { data } = (await getSupabase()?.auth.getSession()) ?? { data: { session: null } };
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
      this.statusText = "Joining the meeting…";
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
    let m: AthleticsServerMessage;
    try {
      m = JSON.parse(raw) as AthleticsServerMessage;
    } catch {
      return;
    }
    switch (m.t) {
      case "welcome":
        this.viewer = m.you;
        this.onMeta({ ...m, avatars: m.avatars as (AvatarConfig | null)[] });
        break;
      case "s":
        this.snapshot(m.st, m.idx, m.points);
        break;
      case "ev":
        // Your own instant actions were already played locally.
        this.events.push(...m.e.filter((e) => !(e.a === this.viewer && LOCAL_KINDS.has(e.kind))));
        break;
      case "next":
        this.points = m.points;
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
        this.rtt = this.rtt * 0.7 + (performance.now() - m.c) * 0.3;
        break;
    }
  }

  /** Server state + replay of my unconfirmed taps, fast-forwarded to "now + one-way latency". */
  private snapshot(st: EventState, idx: number, points: number[]) {
    const newEvent = idx !== this.idx || !this.s || st.event !== this.s.event;
    const target = newEvent || !this.s ? st.t + this.rtt / 2000 : Math.max(st.t, this.s.t);
    this.points = points;
    if (newEvent) {
      this.idx = idx;
      this.pending = [];
      this.onEventChange(idx);
    }
    const s = structuredClone(st);
    s.events = [];
    const ack = s.athletes[this.viewer]?.lastSeq ?? -1;
    this.seq = Math.max(this.seq, ack);
    this.pending = this.pending.filter((p) => p.seq > ack);
    let k = 0;
    while (s.t < target - 1e-4) {
      const dt = Math.min(1 / 60, target - s.t);
      while (k < this.pending.length && this.pending[k]!.at <= s.t + dt) {
        const p = this.pending[k++]!;
        applyEventInput(s, this.viewer, { seq: p.seq, key: p.key, down: p.down });
      }
      this.ai(s);
      stepEvent(s, dt);
    }
    for (; k < this.pending.length; k++) applyEventInput(s, this.viewer, { seq: this.pending[k]!.seq, key: this.pending[k]!.key, down: this.pending[k]!.down });
    takeEventEvents(s);
    this.s = s;
  }

  private ai(s: EventState) {
    for (let i = HUMANS; i < s.athletes.length; i++) {
      const e = aiEvent(s, i, AI_SKILLS[i - HUMANS] ?? 0.6, ++this.aiSeq);
      if (e) applyEventInput(s, i, { ...e, seq: Math.max(e.seq, s.athletes[i]!.lastSeq + 1) });
    }
  }

  state() {
    return this.s;
  }

  press(key: Key, down: boolean) {
    if (!this.s || !this.playing || this.spectate) return;
    const seq = ++this.seq;
    this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ t: "in", seq, key, down }));
    this.pending.push({ seq, key, down, at: this.s.t });
    applyEventInput(this.s, this.viewer, { seq, key, down });
    if (this.pending.length > 400) this.pending.shift();
  }

  update(dt: number) {
    const out = this.events;
    this.events = [];
    if (!this.s) return out;
    if (this.playing) {
      this.ai(this.s);
      stepEvent(this.s, Math.min(dt, 1 / 20));
    }
    // Local (instant) events for my own athlete; everything else comes from the server.
    for (const e of takeEventEvents(this.s)) if (e.a === this.viewer && LOCAL_KINDS.has(e.kind)) out.push(e);
    return out;
  }

  status() {
    if (this.statusText) return this.statusText;
    return this.rtt > 220 ? `High latency (${Math.round(this.rtt)} ms)` : null;
  }

  destroy() {
    this.ended = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}
