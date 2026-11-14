/**
 * Online Rooftop Rush client. Your jumps and slides are applied to a local copy of the race the
 * instant you press (so your runner reacts immediately), sent to the server, and replayed on top of
 * every server snapshot until confirmed. Trips, falls, finish times and the winner come from the server.
 */
import type { ParkourDriver } from "@/game/parkour/driver";
import { FIELD_SIZE, HUMANS, type ParkourMeta, type ParkourServerMessage, type RaceSnapshot } from "@/game/parkour/net";
import { aiInput, applyInput, createRace, stepRace, takeEvents, type Course, type Key, type ParkourEvent, type RaceState } from "@/game/parkour/sim";
import type { AvatarConfig } from "./avatar";
import { getSupabase } from "./supabase";
import { REALTIME_URL } from "./tennis-online";

export interface ParkourEnd { order: number[]; times: (number | null)[]; winner: number; forfeit: boolean; saved: boolean }

const FATAL: Record<string, string> = {
  UNAUTHORIZED: "Please sign in again to race online.",
  MATCH_UNAVAILABLE: "This race isn't live on the game server (it may have finished).",
  NOT_IN_MATCH: "You're not a runner in this race.",
  CANNOT_WATCH: "You can watch live races of your friends only, while they're still running.",
};
/** Pure feedback for your own runner, played locally without waiting for the server. */
const LOCAL_KINDS = new Set(["step", "jump", "vault", "slide", "land", "climb", "lane", "grab"]);
const AI_SKILLS = [0.8, 0.6];

export class OnlineParkourDriver implements ParkourDriver {
  viewer = 0;
  private ws: WebSocket | null = null;
  private s: RaceState | null = null;
  private course: Course | null = null;
  private seq = 0;
  private aiSeq = 5_000_000;
  private pending: { seq: number; key: Key; down: boolean; at: number }[] = [];
  private events: ParkourEvent[] = [];
  private statusText: string | null = "Connecting to the game server…";
  private playing = false;
  private ended = false;
  private fatal = false;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  rtt = 150;
  onMeta: (m: ParkourMeta & { avatars: (AvatarConfig | null)[] }) => void = () => {};
  onReady: () => void = () => {};
  onEnd: (e: ParkourEnd) => void = () => {};
  onFatal: (msg: string) => void = () => {};
  private readonly matchId: string;
  /** Read-only: follow the race from the first runner's seat; inputs are never sent. */
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
      this.statusText = "Joining the race…";
      this.pingTimer = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ t: "ping", c: performance.now() })), 2000);
    };
    ws.onmessage = (e) => this.message(String(e.data));
    ws.onclose = () => {
      clearTimeout(slow);
      if (this.pingTimer) clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.ended || this.fatal) return;
      this.playing = false;
      this.retries++;
      this.statusText = "Connection lost — reconnecting…";
      this.retryTimer = setTimeout(() => void this.connect(), Math.min(5000, 800 * 2 ** Math.min(this.retries, 3)));
    };
  }

  private message(raw: string) {
    let m: ParkourServerMessage;
    try {
      m = JSON.parse(raw) as ParkourServerMessage;
    } catch {
      return;
    }
    switch (m.t) {
      case "welcome":
        this.viewer = m.you;
        if (!this.course || this.course.seed !== m.seed) this.course = createRace(FIELD_SIZE, m.seed, m.length).course;
        this.onMeta({ ...m, avatars: m.avatars as (AvatarConfig | null)[] });
        break;
      case "s":
        this.snapshot(m.st);
        break;
      case "ev":
        this.events.push(...m.e.filter((e) => !(e.a === this.viewer && LOCAL_KINDS.has(e.kind))));
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
        this.statusText = null;
        // Keep the scene running (other runners finish) and show the server's result.
        this.playing = true;
        if (this.s) {
          this.s.phase = "over";
          this.s.order = [...m.order];
          this.s.overAt = this.s.t;
          m.times.forEach((t, i) => {
            const r = this.s!.runners[i];
            if (r && t !== null && r.finish === null) r.finish = t;
          });
        }
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

  /** Server state + replay of my unconfirmed presses, fast-forwarded to "now + one-way latency". */
  private snapshot(st: RaceSnapshot) {
    if (!this.course || this.ended) return;
    const first = !this.s;
    const target = first ? st.t + this.rtt / 2000 : Math.max(st.t, this.s!.t);
    const s: RaceState = { ...structuredClone(st), course: this.course, events: [] };
    const ack = s.runners[this.viewer]?.lastSeq ?? -1;
    this.seq = Math.max(this.seq, ack);
    this.pending = this.pending.filter((p) => p.seq > ack);
    let k = 0;
    while (s.t < target - 1e-4) {
      const dt = Math.min(1 / 60, target - s.t);
      while (k < this.pending.length && this.pending[k]!.at <= s.t + dt) {
        const p = this.pending[k++]!;
        applyInput(s, this.viewer, { seq: p.seq, key: p.key, down: p.down });
      }
      this.ai(s);
      stepRace(s, dt);
    }
    for (; k < this.pending.length; k++) applyInput(s, this.viewer, { seq: this.pending[k]!.seq, key: this.pending[k]!.key, down: this.pending[k]!.down });
    takeEvents(s);
    this.s = s;
    if (first) this.onReady();
  }

  private ai(s: RaceState) {
    for (let i = HUMANS; i < s.runners.length; i++) {
      const e = aiInput(s, i, AI_SKILLS[i - HUMANS] ?? 0.6, ++this.aiSeq);
      if (e) applyInput(s, i, { ...e, seq: Math.max(e.seq, s.runners[i]!.lastSeq + 1) });
    }
  }

  state() {
    return this.s;
  }

  press(key: Key, down: boolean) {
    if (!this.s || !this.playing || this.ended || this.spectate) return;
    const seq = ++this.seq;
    this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ t: "in", seq, key, down }));
    this.pending.push({ seq, key, down, at: this.s.t });
    applyInput(this.s, this.viewer, { seq, key, down });
    if (this.pending.length > 300) this.pending.shift();
  }

  update(dt: number) {
    const out = this.events;
    this.events = [];
    if (!this.s) return out;
    if (this.playing) {
      this.ai(this.s);
      stepRace(this.s, Math.min(dt, 1 / 20));
    }
    for (const e of takeEvents(this.s)) {
      // My own instant feedback is local; after the server's end, everything is local.
      if ((e.a === this.viewer && LOCAL_KINDS.has(e.kind)) || this.ended) out.push(e);
    }
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
