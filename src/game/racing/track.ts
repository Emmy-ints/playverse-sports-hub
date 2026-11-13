/**
 * Race tracks: closed Catmull-Rom splines sampled every ~2 m into a centre line with tangents,
 * left normals and distance along the lap. Pure data + geometry, shared by client, AI and server.
 */

export interface TrackDef {
  id: "city" | "coast" | "valley";
  name: string;
  blurb: string;
  width: number;
  /** Control points [x, z] in metres, clockwise. The start line is at the first point. */
  points: [number, number][];
}

export const TRACKS: Record<TrackDef["id"], TrackDef> = {
  city: {
    id: "city", name: "Neon City Circuit", blurb: "Night street race: tight corners, long straights.", width: 13,
    points: [[0, 0], [0, -180], [20, -250], [90, -270], [170, -250], [200, -190], [240, -170], [330, -180], [380, -140], [380, -40],
      [340, 20], [260, 30], [230, 80], [240, 160], [200, 220], [120, 230], [60, 200], [20, 140], [0, 80]],
  },
  coast: {
    id: "coast", name: "Coastal Ridge", blurb: "Fast, flowing seaside sweepers.", width: 14,
    points: [[0, 0], [10, -200], [70, -330], [180, -380], [300, -340], [350, -240], [300, -150], [330, -60], [420, -20], [460, 80],
      [400, 180], [280, 200], [180, 150], [90, 190], [20, 140]],
  },
  valley: {
    id: "valley", name: "Valley Ring", blurb: "Countryside circuit with a hairpin and esses.", width: 13,
    points: [[0, 0], [0, -150], [-30, -230], [-110, -260], [-180, -220], [-170, -150], [-100, -120], [-90, -60], [-160, -10], [-230, 40],
      [-230, 140], [-160, 200], [-70, 190], [-40, 120], [0, 70]],
  },
};

export interface Track {
  def: TrackDef;
  /** Flattened samples: x, z, tx, tz (unit tangent), curvature, s (distance). */
  x: Float64Array;
  z: Float64Array;
  tx: Float64Array;
  tz: Float64Array;
  curv: Float64Array;
  s: Float64Array;
  n: number;
  length: number;
  halfWidth: number;
  /** Barrier distance from the centre line (run-off beyond the track edge). */
  wall: number;
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const cache = new Map<string, Track>();

export function buildTrack(id: TrackDef["id"]): Track {
  const hit = cache.get(id);
  if (hit) return hit;
  const def = TRACKS[id];
  const P = def.points;
  const m = P.length;
  // Dense sampling first, then resample at even spacing.
  const dense: [number, number][] = [];
  for (let i = 0; i < m; i++) {
    const a = P[(i - 1 + m) % m]!, b = P[i]!, c = P[(i + 1) % m]!, d = P[(i + 2) % m]!;
    for (let k = 0; k < 40; k++) {
      const t = k / 40;
      dense.push([catmull(a[0], b[0], c[0], d[0], t), catmull(a[1], b[1], c[1], d[1], t)]);
    }
  }
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const p = dense[i - 1]!, q = dense[i % dense.length]!;
    cum.push(cum[i - 1]! + Math.hypot(q[0] - p[0], q[1] - p[1]));
  }
  const length = cum[dense.length]!;
  const step = 2;
  const n = Math.floor(length / step);
  const x = new Float64Array(n), z = new Float64Array(n), s = new Float64Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const target = (i * length) / n;
    while (cum[j + 1]! < target) j++;
    const f = (target - cum[j]!) / (cum[j + 1]! - cum[j]! || 1);
    const p = dense[j]!, q = dense[(j + 1) % dense.length]!;
    x[i] = p[0] + (q[0] - p[0]) * f;
    z[i] = p[1] + (q[1] - p[1]) * f;
    s[i] = target;
  }
  const tx = new Float64Array(n), tz = new Float64Array(n), curv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const dx = x[b]! - x[a]!, dz = z[b]! - z[a]!;
    const l = Math.hypot(dx, dz) || 1;
    tx[i] = dx / l;
    tz[i] = dz / l;
  }
  for (let i = 0; i < n; i++) {
    // Curvature from the change in heading over ±6 samples (smoothed).
    const a = (i - 6 + n) % n, b = (i + 6) % n;
    const ha = Math.atan2(tx[a]!, -tz[a]!), hb = Math.atan2(tx[b]!, -tz[b]!);
    let dh = hb - ha;
    while (dh > Math.PI) dh -= 2 * Math.PI;
    while (dh < -Math.PI) dh += 2 * Math.PI;
    curv[i] = dh / (12 * (length / n));
  }
  const t: Track = { def, x, z, tx, tz, curv, s, n, length, halfWidth: def.width / 2, wall: def.width / 2 + 4.5 };
  cache.set(id, t);
  return t;
}

/** Nearest centre-line sample to (px, pz), searching near `hint` first. */
export function nearest(t: Track, px: number, pz: number, hint = -1): number {
  let best = -1, bd = Infinity;
  const scan = (from: number, count: number) => {
    for (let k = 0; k < count; k++) {
      const i = (((from + k) % t.n) + t.n) % t.n;
      const d = (t.x[i]! - px) ** 2 + (t.z[i]! - pz) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
  };
  if (hint >= 0) {
    scan(hint - 30, 61);
    if (bd < (t.wall + 6) ** 2) return best;
  }
  scan(0, t.n);
  return best;
}

/** Signed lateral offset from the centre line (positive = left of travel direction). */
export function lateral(t: Track, i: number, px: number, pz: number) {
  const dx = px - t.x[i]!, dz = pz - t.z[i]!;
  // Left normal of tangent (tx, tz) on the XZ plane with Y up is (tz, -tx).
  return dx * t.tz[i]! - dz * t.tx[i]!;
}

/** Distance along the lap at the projection of (px, pz) near sample i. */
export function along(t: Track, i: number, px: number, pz: number) {
  const dx = px - t.x[i]!, dz = pz - t.z[i]!;
  let s = t.s[i]! + dx * t.tx[i]! + dz * t.tz[i]!;
  if (s < 0) s += t.length;
  if (s >= t.length) s -= t.length;
  return s;
}

/** Index of the sample at distance s (wrapped). */
export function indexAt(t: Track, s: number) {
  const w = ((s % t.length) + t.length) % t.length;
  return Math.floor((w / t.length) * t.n) % t.n;
}
