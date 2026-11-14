/**
 * The ideal racing line for a track: a smoothed path that cuts toward the inside of each bend, and a
 * speed profile (corner speed from curvature, braking and acceleration limits) used to colour it.
 */
import type { Track } from "./track.ts";

export interface RacingLine {
  x: Float64Array;
  z: Float64Array;
  /** Target speed (m/s) at each sample. */
  v: Float64Array;
  /** -1 braking … 0 lift … +1 full power. */
  phase: Float64Array;
  /** True where the line is worth showing in "corners" mode. */
  corner: Uint8Array;
}

const cache = new WeakMap<Track, RacingLine>();

export function racingLine(t: Track, maxSpeed = 72, latG = 22, brake = 22, accel = 9): RacingLine {
  const hit = cache.get(t);
  if (hit) return hit;
  const n = t.n;
  const ds = t.length / n;
  // Offset toward the inside of the bend, smoothed over ~40 m so the line flows.
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = Math.max(-1, Math.min(1, -t.curv[i]! * 70)) * t.halfWidth * 0.6;
  const off = new Float64Array(n);
  const W = Math.max(2, Math.round(20 / ds));
  for (let i = 0; i < n; i++) {
    let a = 0, w = 0;
    for (let k = -W; k <= W; k++) {
      const wk = W + 1 - Math.abs(k);
      a += raw[(i + k + n) % n]! * wk;
      w += wk;
    }
    off[i] = a / w;
  }
  const x = new Float64Array(n), z = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    x[i] = t.x[i]! + t.tz[i]! * off[i]!;
    z[i] = t.z[i]! - t.tx[i]! * off[i]!;
  }
  // Speed profile: corner limit, then braking (backward) and acceleration (forward) passes, twice around.
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const k = Math.abs(t.curv[i]!);
    v[i] = k < 1e-5 ? maxSpeed : Math.min(maxSpeed, Math.sqrt(latG / k));
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 2 * n - 1; j >= 0; j--) {
      const i = j % n, nx = (i + 1) % n;
      v[i] = Math.min(v[i]!, Math.sqrt(v[nx]! * v[nx]! + 2 * brake * ds));
    }
    for (let j = 0; j < 2 * n; j++) {
      const i = j % n, pv = (i - 1 + n) % n;
      v[i] = Math.min(v[i]!, Math.sqrt(v[pv]! * v[pv]! + 2 * accel * ds));
    }
  }
  const phase = new Float64Array(n);
  const corner = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const dv = v[(i + 1) % n]! - v[i]!;
    phase[i] = dv < -0.02 ? -1 : dv > 0.02 || v[i]! >= maxSpeed * 0.98 ? 1 : 0;
  }
  // "Corners" mode: braking zones, the bend itself (radius under ~110 m) and a short exit.
  const exit = Math.round(8 / ds);
  for (let i = 0; i < n; i++) {
    if (phase[i]! < 0 || Math.abs(t.curv[i]!) > 0.014) for (let k = 0; k <= exit; k++) corner[(i + k) % n] = 1;
  }
  const line = { x, z, v, phase, corner };
  cache.set(t, line);
  return line;
}
