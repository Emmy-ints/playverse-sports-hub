/**
 * Authoritative tennis simulation (pure TypeScript, no imports beyond scoring): court, ball physics
 * with drag, spin and surface-dependent bounces, player movement, armed shots that strike automatically
 * at the right moment if the player is in position, serves/faults, point rules and statistics.
 *
 * Player 0 defends the +Z half, player 1 the −Z half. The net is at z = 0.
 */
import { awardPoint, currentServer, newScore, serveSide, type MatchFormat, type Score } from "./scoring.ts";

export const COURT = {
  halfLength: 11.885,
  halfWidth: 4.115, // singles
  serviceLine: 6.4,
  netHeightCenter: 0.914,
  netHeightPost: 1.07,
  postX: 5.03,
} as const;

export type Surface = "hard" | "clay" | "grass" | "indoor";
const SURFACE: Record<Surface, { e: number; keep: number }> = {
  hard: { e: 0.76, keep: 0.68 },
  indoor: { e: 0.74, keep: 0.72 },
  clay: { e: 0.8, keep: 0.58 },
  grass: { e: 0.64, keep: 0.8 },
};

export type ShotType = "flat" | "topspin" | "lob" | "drop";

export interface PlayerInput {
  seq: number;
  /** Movement intent, each -1..1 in court axes (x = across, z = along). */
  mx: number;
  mz: number;
  sprint: boolean;
  /** Arm a shot: it fires automatically when the ball is in reach (expires after a moment). */
  shot?: { type: ShotType; aim: number; power: number; special?: boolean } | null;
}

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  /** Currently armed shot and when it expires. */
  armed: { type: ShotType; aim: number; power: number; special?: boolean; until: number } | null;
  /** Special-shot meter 0..1: fills with each clean hit; when full, a special shot is faster and safer. */
  special: number;
  /** Last swing for animation: "fh" | "bh" | "serve" | "" and its start time. */
  swing: "fh" | "bh" | "serve" | "";
  swingAt: number;
  lastSeq: number;
}

export interface BallState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  spin: number;
  /** Who hit it last (0/1), -1 when held for serve. */
  lastHitter: number;
  /** Bounces since the last hit. */
  bounces: number;
  /** Side of the first bounce (0/1) or -1. */
  bounceSide: number;
  /** Whether the receiver has touched the serve (for ace stats). */
  isServe: boolean;
  serveFault: boolean;
  /** Time of the last hit. */
  hitAt: number;
}

export type Phase = "serve" | "rally" | "pointOver" | "matchOver";

export interface TennisEvent {
  t: number;
  kind: "hit" | "bounce" | "net" | "out" | "fault" | "double_fault" | "point" | "game" | "set" | "match" | "ace" | "winner" | "error";
  player?: number;
  detail?: string;
}

export interface PlayerStats { aces: number; doubleFaults: number; winners: number; errors: number; pointsWon: number }

export interface TennisState {
  t: number;
  phase: Phase;
  phaseUntil: number;
  players: [PlayerState, PlayerState];
  ball: BallState;
  score: Score;
  faults: number;
  stats: [PlayerStats, PlayerStats];
  events: TennisEvent[];
  surface: Surface;
  format: MatchFormat;
  /** Seeded RNG state for shot error (server-owned; clients never decide outcomes). */
  rng: number;
}

const G = 9.81;
const DRAG = 0.019; // per metre (Cd·ρ·A / 2m)
const BALL_R = 0.033;
const REACH = 1.4;
const ARM_TIME = 0.9;
const RUN = 5.0, SPRINT = 6.5, ACCEL = 18;
const SIDE = [1, -1] as const; // player 0 on +Z, player 1 on −Z

const newPlayer = (z: number): PlayerState => ({ x: 0, z, vx: 0, vz: 0, armed: null, special: 0, swing: "", swingAt: -10, lastSeq: -1 });
const emptyStats = (): PlayerStats => ({ aces: 0, doubleFaults: 0, winners: 0, errors: 0, pointsWon: 0 });

function rand(s: TennisState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function createMatch(format: MatchFormat, surface: Surface, firstServer: 0 | 1 = 0, seed = 1): TennisState {
  const s: TennisState = {
    t: 0,
    phase: "serve",
    phaseUntil: 0,
    players: [newPlayer(COURT.halfLength + 0.6), newPlayer(-COURT.halfLength - 0.6)],
    ball: { x: 0, y: 1, z: 0, vx: 0, vy: 0, vz: 0, spin: 0, lastHitter: -1, bounces: 0, bounceSide: -1, isServe: false, serveFault: false, hitAt: 0 },
    score: newScore(firstServer),
    faults: 0,
    stats: [emptyStats(), emptyStats()],
    events: [],
    surface,
    format,
    rng: seed >>> 0,
  };
  setupServe(s);
  return s;
}

/** Position players for the next serve and hold the ball at the server. */
function setupServe(s: TennisState) {
  const srv = currentServer(s.score);
  const side = serveSide(s.score);
  for (const p of [0, 1] as const) {
    const pl = s.players[p];
    // From each player's own view, "deuce" is their right half. Player 0 faces −Z (right = +X), player 1 faces +Z (right = −X).
    const right = SIDE[p];
    const xSide = (side === "deuce" ? 1 : -1) * right;
    pl.x = p === srv ? xSide * 0.8 : xSide * 2.6;
    pl.z = SIDE[p] * (COURT.halfLength + (p === srv ? 0.15 : 0.9));
    pl.vx = pl.vz = 0;
    pl.armed = null;
  }
  const sp = s.players[srv];
  s.ball = { x: sp.x + 0.25 * SIDE[srv], y: 1.0, z: sp.z, vx: 0, vy: 0, vz: 0, spin: 0, lastHitter: -1, bounces: 0, bounceSide: -1, isServe: false, serveFault: false, hitAt: 0 };
  s.phase = "serve";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const netHeight = (x: number) => COURT.netHeightCenter + (COURT.netHeightPost - COURT.netHeightCenter) * Math.min(1, (x / COURT.postX) ** 2);
const sideOf = (z: number) => (z >= 0 ? 0 : 1);

/** Sanitize untrusted input (server side). */
export function sanitizeInput(raw: unknown): PlayerInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, d = 0) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const input: PlayerInput = { seq: Math.floor(num(r["seq"], -1)), mx: clamp(num(r["mx"]), -1, 1), mz: clamp(num(r["mz"]), -1, 1), sprint: r["sprint"] === true, shot: null };
  const shot = r["shot"] as Record<string, unknown> | null | undefined;
  if (shot && typeof shot === "object") {
    const type = shot["type"];
    if (type === "flat" || type === "topspin" || type === "lob" || type === "drop") {
      input.shot = { type, aim: clamp(num(shot["aim"]), -1, 1), power: clamp(num(shot["power"], 0.5), 0, 1), special: shot["special"] === true };
    }
  }
  return input;
}

export function applyInput(s: TennisState, p: 0 | 1, input: PlayerInput) {
  const pl = s.players[p];
  if (input.seq <= pl.lastSeq) return; // duplicate / out-of-order
  pl.lastSeq = input.seq;
  (pl as PlayerState & { intent?: PlayerInput }).intent = input;
  if (input.shot && (s.phase === "rally" || (s.phase === "serve" && currentServer(s.score) === p))) {
    pl.armed = { ...input.shot, until: s.t + ARM_TIME };
  }
}

/** Advance the simulation by dt seconds (internally sub-stepped). */
export function step(s: TennisState, dt: number) {
  const sub = Math.max(1, Math.ceil(dt / (1 / 240)));
  const h = dt / sub;
  for (let i = 0; i < sub; i++) tick(s, h);
}

function tick(s: TennisState, dt: number) {
  s.t += dt;
  if (s.phase === "matchOver") return;
  if (s.phase === "pointOver") {
    if (s.t >= s.phaseUntil) setupServe(s);
    return;
  }
  movePlayers(s, dt);

  if (s.phase === "serve") {
    const srv = currentServer(s.score);
    const sp = s.players[srv];
    s.ball.x = sp.x + 0.25 * SIDE[srv];
    s.ball.z = sp.z;
    s.ball.y = 1.0;
    if (sp.armed) serve(s, srv);
    return;
  }

  // Strikes: an armed player swings when the ball reaches the hitting zone.
  for (const p of [0, 1] as const) tryStrike(s, p);
  moveBall(s, dt);
}

function movePlayers(s: TennisState, dt: number) {
  for (const p of [0, 1] as const) {
    const pl = s.players[p] as PlayerState & { intent?: PlayerInput };
    const it = pl.intent;
    const isServer = s.phase === "serve" && currentServer(s.score) === p;
    let mx = it?.mx ?? 0, mz = it?.mz ?? 0;
    if (s.phase === "serve") mz = 0; // stay behind the line until the serve
    const len = Math.hypot(mx, mz);
    if (len > 1) { mx /= len; mz /= len; }
    const top = it?.sprint ? SPRINT : RUN;
    const tx = mx * top, tz = mz * top;
    const ax = clamp(tx - pl.vx, -ACCEL * dt, ACCEL * dt), az = clamp(tz - pl.vz, -ACCEL * dt, ACCEL * dt);
    pl.vx += ax; pl.vz += az;
    pl.x += pl.vx * dt; pl.z += pl.vz * dt;
    // Stay on your own half (no crossing the net), within the run-off area.
    pl.x = clamp(pl.x, -7, 7);
    if (SIDE[p] > 0) pl.z = clamp(pl.z, 0.6, 17);
    else pl.z = clamp(pl.z, -17, -0.6);
    if (isServer) {
      // Server stays behind the baseline on their half of the court.
      pl.z = SIDE[p] * Math.max(Math.abs(pl.z), COURT.halfLength + 0.1);
      pl.x = clamp(pl.x, -COURT.halfWidth + 0.2, COURT.halfWidth - 0.2);
    }
    if (pl.armed && s.t > pl.armed.until) pl.armed = null;
  }
}

function serve(s: TennisState, p: 0 | 1) {
  const sp = s.players[p];
  const a = sp.armed!;
  sp.armed = null;
  sp.swing = "serve";
  sp.swingAt = s.t;
  const side = serveSide(s.score);
  // Target the diagonal service box on the receiver's half.
  const recvSide = SIDE[p === 0 ? 1 : 0];
  const right = SIDE[p];
  const boxX = -(side === "deuce" ? 1 : -1) * right; // cross-court
  const tx = boxX * (0.55 + 1.5 * (0.5 + 0.5 * a.aim * boxX)) ;
  const tz = recvSide * (COURT.serviceLine - 0.9 - 0.9 * (1 - a.power));
  const speed = 24 + 20 * a.power; // ~86–158 km/h
  // Bigger serves are riskier.
  const risk = 0.25 + 1.1 * a.power * a.power;
  const ex = (rand(s) - 0.5) * 2 * risk * 0.9, ez = (rand(s) - 0.5) * 2 * risk;
  launch(s, p, sp.x + 0.25 * SIDE[p], 2.7, sp.z, tx + ex, tz + recvSide * ez, speed, a.type === "topspin" ? 0.6 : 0.15, 0.25);
  s.ball.isServe = true;
  s.phase = "rally";
  s.events.push({ t: s.t, kind: "hit", player: p, detail: "serve" });
}

/** Launch the ball from (x,y,z) to land near (tx,tz) with horizontal speed `speed`, clearing the net. */
function launch(s: TennisState, p: 0 | 1, x: number, y: number, z: number, tx: number, tz: number, speed: number, spin: number, clearance: number) {
  const dx = tx - x, dz = tz - z;
  const d = Math.hypot(dx, dz) || 1;
  const gEff = G + 9 * spin * 0.35;
  let t = d / speed;
  let vy = 0;
  for (let iter = 0; iter < 30; iter++) {
    vy = (0 - y + 0.5 * gEff * t * t) / t;
    // Height where the path crosses the net.
    const tn = Math.abs(z) / Math.max(0.01, Math.abs(dz / t));
    const yNet = y + vy * tn - 0.5 * gEff * tn * tn;
    const xNet = x + (dx / t) * tn;
    if (Math.sign(z) === Math.sign(tz) || yNet >= netHeight(xNet) + clearance) break;
    t *= 1.06; // slower and loopier until it clears
  }
  const k = 1 + DRAG * d * 0.5; // compensate for drag
  s.ball = { ...s.ball, x, y, z, vx: (dx / t) * k, vy: vy * (1 + DRAG * d * 0.15), vz: (dz / t) * k, spin, lastHitter: p, bounces: 0, bounceSide: -1, isServe: false, serveFault: false, hitAt: s.t };
}

function tryStrike(s: TennisState, p: 0 | 1) {
  const pl = s.players[p];
  const b = s.ball;
  if (!pl.armed || b.lastHitter === p && b.bounces === 0) return; // can't hit your own shot twice
  if (sideOf(b.z) !== p) return;
  if (b.lastHitter === -1) return;
  // Serve must bounce before it can be returned.
  if (b.isServe && b.bounces === 0) return;
  if (b.bounces >= 2) return;
  // Volleys allowed only away from the net tape.
  if (b.bounces === 0 && Math.abs(b.z) < 1.2) return;
  const dx = b.x - pl.x, dz = b.z - pl.z;
  const dist = Math.hypot(dx, dz);
  if (dist > REACH || b.y < 0.15 || b.y > 2.7) return;
  // Only hit a ball coming toward you (or nearly stopped).
  if (b.vz * SIDE[p] < -0.5 && b.bounces === 0 && dist > 0.6) return;

  const a = pl.armed;
  pl.armed = null;
  pl.swing = dx * SIDE[p] >= 0 ? "fh" : "bh"; // ball on the player's right → forehand
  pl.swingAt = s.t;
  // Contact quality: best around 0.9 m from the body. Error grows with power, incoming pace,
  // running while hitting and an awkward contact point — so going for the lines is a real risk.
  const off = Math.abs(dist - 0.9) / REACH;
  const pace = Math.hypot(b.vx, b.vz);
  const running = Math.hypot(pl.vx, pl.vz);
  const errSign = dx >= 0 ? 1 : -1;

  const oppSide = SIDE[p === 0 ? 1 : 0];
  let depth: number, speed: number, spin: number, clearance: number;
  switch (a.type) {
    case "flat": depth = 0.55 + 0.4 * a.power; speed = 22 + 14 * a.power; spin = 0.2; clearance = 0.12; break;
    case "topspin": depth = 0.5 + 0.42 * a.power; speed = 18 + 11 * a.power; spin = 1; clearance = 0.55; break;
    case "lob": depth = 0.82 + 0.15 * a.power; speed = 9 + 4 * a.power; spin = 0.5; clearance = 3.2; break;
    case "drop": depth = 0.12 + 0.12 * a.power; speed = 7 + 3 * a.power; spin = -0.9; clearance = 0.25; break;
  }
  const special = !!a.special && pl.special >= 1;
  if (special) {
    pl.special = 0;
    speed *= 1.18;
  } else {
    pl.special = Math.min(1, pl.special + 0.14 * (1 - off));
  }
  const risk = (special ? 0.4 : 1) * 0.1 + (special ? 0.4 : 1) * off * off * 2.2 + 0.55 * a.power * a.power + pace / 50 + running / 16 + (a.type === "drop" ? 0.35 : 0);
  // Bell-shaped error (sum of three uniforms) with a tail, so most shots land near the target
  // but a tired, rushed or greedy swing can miss long, wide or into the net.
  const gauss = () => (rand(s) + rand(s) + rand(s) - 1.5) * 1.15;
  const ex = gauss() * risk * 1.5 + errSign * off * 0.6;
  const ez = gauss() * risk * 1.85;
  const ey = gauss() * risk * 0.6 + 0.12;
  const tz = oppSide * (depth * COURT.halfLength + ez);
  const tx = clamp(a.aim, -1, 1) * (COURT.halfWidth - 0.45) + ex;
  launch(s, p, b.x, Math.max(0.35, b.y), b.z, tx, tz, speed, spin, clearance);
  s.ball.vy += ey; // a mistimed racket face sends it high (long) or low (net)
  s.events.push({ t: s.t, kind: "hit", player: p, detail: `${pl.swing}:${a.type}${special ? ":special" : ""}` });
}

function moveBall(s: TennisState, dt: number) {
  const b = s.ball;
  const v = Math.hypot(b.vx, b.vy, b.vz);
  const prevZ = b.z;
  b.vx -= DRAG * v * b.vx * dt;
  b.vy -= (G + 9 * b.spin * 0.35 * (v / 25)) * dt + DRAG * v * b.vy * dt;
  b.vz -= DRAG * v * b.vz * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  b.z += b.vz * dt;

  // Net: crossing z = 0 below the tape.
  if (Math.sign(prevZ) !== Math.sign(b.z) && Math.abs(b.x) < COURT.postX + 0.3 && b.y < netHeight(b.x) + BALL_R) {
    b.z = prevZ > 0 ? 0.05 : -0.05;
    b.vz *= -0.15;
    b.vx *= 0.3;
    if (b.bounces === 0) {
      s.events.push({ t: s.t, kind: "net", player: b.lastHitter });
      if (b.lastHitter >= 0) {
        if (b.isServe) return fault(s);
        return endPoint(s, (1 - b.lastHitter) as 0 | 1, "net");
      }
    }
  }

  if (b.y <= BALL_R && b.vy < 0) {
    b.y = BALL_R;
    const surf = SURFACE[s.surface];
    b.vy = -b.vy * surf.e;
    const keep = surf.keep + 0.12 * b.spin;
    b.vx *= keep;
    b.vz *= keep;
    b.spin *= 0.5;
    b.bounces += 1;
    const side = sideOf(b.z);
    s.events.push({ t: s.t, kind: "bounce", detail: `${b.x.toFixed(2)},${b.z.toFixed(2)}` });
    const hitter = b.lastHitter;
    if (b.bounces === 1 && hitter >= 0) {
      b.bounceSide = side;
      const target = (1 - hitter) as 0 | 1;
      const inCourt = Math.abs(b.x) <= COURT.halfWidth + BALL_R && Math.abs(b.z) <= COURT.halfLength + BALL_R;
      if (b.isServe) {
        const inBox = side === target && Math.abs(b.z) <= COURT.serviceLine + BALL_R && inServiceBox(s, hitter as 0 | 1, b.x);
        if (!inBox) return fault(s);
      } else if (side !== target || !inCourt) {
        s.events.push({ t: s.t, kind: "out", player: hitter });
        return endPoint(s, target, "out");
      }
    } else if (b.bounces >= 2 && hitter >= 0) {
      // Second bounce: the receiver couldn't get it back.
      return endPoint(s, hitter as 0 | 1, b.isServe ? "ace" : "winner");
    }
  }
  // Ball left the arena without a second bounce.
  if (Math.abs(b.z) > 22 || Math.abs(b.x) > 14) {
    const hitter = b.lastHitter;
    if (hitter >= 0) {
      if (b.bounces === 0) {
        s.events.push({ t: s.t, kind: "out", player: hitter });
        if (b.isServe) return fault(s);
        return endPoint(s, (1 - hitter) as 0 | 1, "out");
      }
      return endPoint(s, hitter as 0 | 1, b.isServe ? "ace" : "winner");
    }
  }
}

function inServiceBox(s: TennisState, server: 0 | 1, x: number) {
  const side = serveSide(s.score);
  const right = SIDE[server];
  const boxSign = -(side === "deuce" ? 1 : -1) * right;
  return x * boxSign >= -BALL_R && Math.abs(x) <= COURT.halfWidth + BALL_R;
}

function fault(s: TennisState) {
  const srv = currentServer(s.score);
  s.faults += 1;
  if (s.faults >= 2) {
    s.events.push({ t: s.t, kind: "double_fault", player: srv });
    s.stats[srv].doubleFaults += 1;
    return endPoint(s, (1 - srv) as 0 | 1, "double_fault");
  }
  s.events.push({ t: s.t, kind: "fault", player: srv });
  s.phase = "pointOver";
  s.phaseUntil = s.t + 1.2;
}

function endPoint(s: TennisState, winner: 0 | 1, how: string) {
  const loser = (1 - winner) as 0 | 1;
  s.stats[winner].pointsWon += 1;
  if (how === "ace") s.stats[winner].aces += 1;
  if (how === "winner") s.stats[winner].winners += 1;
  if (how === "out" || how === "net") s.stats[loser].errors += 1;
  s.events.push({ t: s.t, kind: "point", player: winner, detail: how });
  const r = awardPoint(s.score, winner, s.format);
  s.score = r.score;
  s.faults = 0;
  if (r.game) s.events.push({ t: s.t, kind: "game", player: winner });
  if (r.set) s.events.push({ t: s.t, kind: "set", player: winner });
  if (r.match) {
    s.events.push({ t: s.t, kind: "match", player: winner });
    s.phase = "matchOver";
    return;
  }
  s.phase = "pointOver";
  s.phaseUntil = s.t + 2;
  s.players.forEach((p) => (p.armed = null));
}

/** Forfeit (e.g. disconnection): the other player wins the match. */
export function forfeit(s: TennisState, loser: 0 | 1) {
  const w = (1 - loser) as 0 | 1;
  s.score = { ...s.score, winner: w };
  s.phase = "matchOver";
  s.events.push({ t: s.t, kind: "match", player: w, detail: "forfeit" });
}

/** Where the ball will be when it next reaches height `y` going down on side `p` (for AI / aim helpers). */
export function predictLanding(s: TennisState): { x: number; z: number; t: number } | null {
  const b = { ...s.ball };
  let t = 0;
  for (let i = 0; i < 600; i++) {
    const v = Math.hypot(b.vx, b.vy, b.vz);
    const dt = 1 / 120;
    b.vx -= DRAG * v * b.vx * dt;
    b.vy -= (G + 9 * b.spin * 0.35 * (v / 25)) * dt + DRAG * v * b.vy * dt;
    b.vz -= DRAG * v * b.vz * dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    t += dt;
    if (b.y <= BALL_R) return { x: b.x, z: b.z, t };
  }
  return null;
}

/** Simple AI opponent for practice: chase the ball, arm a shot early, aim away from the opponent. */
export function aiInput(s: TennisState, p: 0 | 1, level = 0.6, seq = 0): PlayerInput {
  const me = s.players[p];
  const opp = s.players[p === 0 ? 1 : 0];
  const b = s.ball;
  let tx = 0, tz = SIDE[p] * (COURT.halfLength + 0.5);
  let shot: PlayerInput["shot"] = null;
  if (s.phase === "serve") {
    if (currentServer(s.score) === p && Math.floor(s.t * 10) % 15 === 0) shot = { type: "flat", aim: 0.3, power: 0.45 + 0.3 * level };
    return { seq, mx: 0, mz: 0, sprint: false, shot };
  }
  const comingToMe = sideOf(b.z) === p || b.vz * SIDE[p] > 0;
  const reaction = 0.42 - 0.25 * level; // seconds before the AI reads the shot
  if (comingToMe && s.phase === "rally" && b.lastHitter !== p && s.t - b.hitAt < reaction) {
    // Still reacting: drift back toward the middle of the baseline.
    tx = me.x * 0.9;
  } else if (comingToMe && s.phase === "rally" && b.lastHitter !== p) {
    // Intercept after the bounce: predict where it lands, then stand a bit behind it.
    const land = b.bounces === 0 ? predictLanding(s) : { x: b.x + b.vx * 0.35, z: b.z + b.vz * 0.35, t: 0 };
    if (land) {
      // Imperfect read of the bounce, worse for weaker AI.
      const misread = Math.sin(b.hitAt * 7.3 + p) * (1 - level) * 1.4;
      tx = land.x + misread - 0.4 * (land.x > me.x ? 1 : -1);
      tz = land.z + SIDE[p] * (1.6 + (1 - level) * 0.8);
    }
    const aimAway = opp.x > 0 ? -0.75 : 0.75;
    const wobble = Math.sin(s.t * 1.7 + p * 2) * 0.35;
    shot = { type: level > 0.7 && Math.abs(opp.z) < 6 ? "lob" : Math.sin(s.t * 0.9) > 0.6 ? "flat" : "topspin", aim: clamp(aimAway * level + wobble, -1, 1), power: 0.4 + 0.45 * level };
  } else {
    tx = -b.x * 0.2;
  }
  const dx = tx - me.x, dz = tz - me.z;
  const d = Math.hypot(dx, dz);
  const mx = d > 0.25 ? clamp(dx / d, -1, 1) * Math.min(1, d) : 0;
  const mz = d > 0.25 ? clamp(dz / d, -1, 1) * Math.min(1, d) : 0;
  return { seq, mx: mx * (0.7 + 0.3 * level), mz: mz * (0.7 + 0.3 * level), sprint: d > 4, shot };
}

/** Drain events for broadcasting/UI. */
export function takeEvents(s: TennisState): TennisEvent[] {
  const e = s.events;
  s.events = [];
  return e;
}
