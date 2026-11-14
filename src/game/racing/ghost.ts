/** Keys are `<track>` for GT or `<track>.formula` for the formula car. */
/**
 * Ghost laps: your best lap on each circuit is recorded on this device and replayed as a translucent
 * car you can race against in practice. Samples at 20 Hz (~2 KB per lap).
 */

export interface GhostLap {
  v: 1;
  time: number;
  dt: number;
  /** x, z, heading triplets. */
  p: number[];
  at: string;
}

const KEY = (t: string) => `pv.ghost.racing.${t}`;

export function loadGhost(track: string): GhostLap | null {
  try {
    const g = JSON.parse(localStorage.getItem(KEY(track)) ?? "null") as GhostLap | null;
    return g && g.v === 1 && Array.isArray(g.p) && g.p.length >= 6 ? g : null;
  } catch {
    return null;
  }
}

export function saveGhost(track: string, g: GhostLap) {
  try {
    localStorage.setItem(KEY(track), JSON.stringify(g));
  } catch {
    /* storage full: ghosts are optional */
  }
}

export function clearGhost(track: string) {
  try {
    localStorage.removeItem(KEY(track));
  } catch {
    /* ignore */
  }
}

/** Position of the ghost `t` seconds into its lap (null once the lap is over). */
export function ghostAt(g: GhostLap, t: number): { x: number; z: number; h: number } | null {
  const n = g.p.length / 3;
  const f = t / g.dt;
  if (f < 0 || f >= n - 1) return null;
  const i = Math.floor(f), k = f - i;
  const a = i * 3, b = a + 3;
  let dh = g.p[b + 2]! - g.p[a + 2]!;
  while (dh > Math.PI) dh -= 2 * Math.PI;
  while (dh < -Math.PI) dh += 2 * Math.PI;
  return { x: g.p[a]! + (g.p[b]! - g.p[a]!) * k, z: g.p[a + 1]! + (g.p[b + 1]! - g.p[a + 1]!) * k, h: g.p[a + 2]! + dh * k };
}

/** Records the current lap; call `sample` every frame and `finishLap` when a lap completes. */
export class GhostRecorder {
  private p: number[] = [];
  private next = 0;
  readonly dt: number;
  constructor(dt = 0.05) {
    this.dt = dt;
  }
  start() {
    this.p = [];
    this.next = 0;
  }
  sample(lapT: number, x: number, z: number, h: number) {
    while (lapT >= this.next) {
      this.p.push(Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(h * 1000) / 1000);
      this.next += this.dt;
    }
  }
  finish(time: number): GhostLap | null {
    if (this.p.length < 30) return null;
    return { v: 1, time, dt: this.dt, p: this.p, at: new Date().toISOString() };
  }
}
