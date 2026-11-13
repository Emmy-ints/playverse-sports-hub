/**
 * Procedurally generated golf holes. Pure data + functions (no imports) so the same course exists
 * identically in the browser and on the server.
 *
 * Hole frame: the tee is at (0, 0) and the hole plays roughly toward -Z. Units: metres.
 */

export type Surface = "tee" | "fairway" | "rough" | "green" | "fringe" | "bunker" | "water" | "oob";

export interface Circle { x: number; z: number; r: number }

export interface Hole {
  index: number;
  par: 3 | 4 | 5;
  /** Fairway centreline from tee to green centre. */
  path: [number, number][];
  fairwayWidth: number;
  green: { x: number; z: number; rx: number; rz: number; tiltX: number; tiltZ: number };
  cup: { x: number; z: number };
  bunkers: Circle[];
  water: Circle[];
  trees: { x: number; z: number; h: number; kind: number }[];
  wind: { x: number; z: number };
  /** Rectangle the hole occupies (for terrain/texture and out of bounds). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  length: number;
  seed: number;
}

export interface CourseTheme {
  id: "oceanfront" | "countryside" | "night";
  name: string;
  hdr: string;
  sunDir: [number, number, number];
  sunColor: [number, number, number];
  sunIntensity: number;
  grass: { fairway: string; rough: string; green: string; fringe: string };
  night?: boolean;
}

export const THEMES: Record<CourseTheme["id"], CourseTheme> = {
  oceanfront: {
    id: "oceanfront",
    name: "Oceanfront Links",
    hdr: "/assets/env/oceanfront.hdr",
    sunDir: [-0.4, -0.55, 0.7],
    sunColor: [1, 0.86, 0.7],
    sunIntensity: 2.4,
    grass: { fairway: "#5f9c3b", rough: "#3f6b2a", green: "#6db24a", fringe: "#5aa23c" },
  },
  countryside: {
    id: "countryside",
    name: "Countryside Championship",
    hdr: "/assets/env/countryside.hdr",
    sunDir: [0.5, -0.6, 0.6],
    sunColor: [1, 0.9, 0.78],
    sunIntensity: 2.6,
    grass: { fairway: "#6aa443", rough: "#41702c", green: "#77bb52", fringe: "#62a944" },
  },
  night: {
    id: "night",
    name: "Moonlight Night Golf",
    hdr: "/assets/env/night.hdr",
    sunDir: [0.2, -0.8, 0.4],
    sunColor: [0.75, 0.82, 1],
    sunIntensity: 1.2,
    grass: { fairway: "#3f7a33", rough: "#285020", green: "#4c9440", fringe: "#3f8535" },
    night: true,
  },
};

export const CUP_RADIUS = 0.054;

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 18-hole layout pars (a standard par-72 card). */
const PARS: (3 | 4 | 5)[] = [4, 5, 3, 4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];

export function generateHole(index: number, courseSeed = 1): Hole {
  const rand = rng(courseSeed * 1000 + index + 1);
  const par = PARS[index % 18]!;
  const length = par === 3 ? 125 + rand() * 60 : par === 4 ? 300 + rand() * 90 : 420 + rand() * 70;
  const dogleg = par === 3 ? 0 : (rand() - 0.5) * (par === 5 ? 90 : 70);
  const greenX = dogleg * 0.6 + (rand() - 0.5) * 12;
  const greenZ = -length;
  const bendZ = -length * (0.5 + rand() * 0.15);
  const path: [number, number][] = [
    [0, 0],
    [dogleg * 0.15, bendZ * 0.45],
    [dogleg, bendZ],
    [greenX, greenZ],
  ];
  const fairwayWidth = par === 3 ? 0 : 28 + rand() * 12;
  const rx = 13 + rand() * 5, rz = 15 + rand() * 6;
  const green = { x: greenX, z: greenZ, rx, rz, tiltX: (rand() - 0.5) * 0.022, tiltZ: (rand() - 0.5) * 0.022 };
  const cup = { x: greenX + (rand() - 0.5) * rx * 1.0, z: greenZ + (rand() - 0.5) * rz * 1.0 };

  const bunkers: Circle[] = [];
  const greenSide = rand() > 0.5 ? 1 : -1;
  bunkers.push({ x: greenX + greenSide * (rx + 5), z: greenZ + (rand() - 0.5) * rz, r: 5 + rand() * 3 });
  if (rand() > 0.3) bunkers.push({ x: greenX - greenSide * (rx + 4), z: greenZ + rz * 0.6, r: 4 + rand() * 2.5 });
  if (par !== 3) {
    const landing = pointOnPath(path, Math.min(240, length * 0.62));
    const side = rand() > 0.5 ? 1 : -1;
    bunkers.push({ x: landing[0] + side * (fairwayWidth / 2 + 2), z: landing[1], r: 6 + rand() * 4 });
  }

  const water: Circle[] = [];
  if (rand() > 0.55) {
    const at = pointOnPath(path, length * (par === 3 ? 0.55 : 0.4 + rand() * 0.3));
    const side = par === 3 ? 0 : (rand() > 0.5 ? 1 : -1) * (fairwayWidth / 2 + 14);
    water.push({ x: at[0] + side, z: at[1], r: par === 3 ? 16 + rand() * 8 : 14 + rand() * 10 });
  }

  const minX = Math.min(0, dogleg, greenX) - 75, maxX = Math.max(0, dogleg, greenX) + 75;
  const bounds = { minX, maxX, minZ: greenZ - 45, maxZ: 25 };

  const trees: Hole["trees"] = [];
  const treeCount = 70;
  for (let i = 0; i < treeCount; i++) {
    const t = rand();
    const along = pointOnPath(path, t * length);
    const side = rand() > 0.5 ? 1 : -1;
    const off = (fairwayWidth > 0 ? fairwayWidth / 2 : 14) + 14 + rand() * 30;
    const x = along[0] + side * off, z = along[1] + (rand() - 0.5) * 20;
    if (x < minX + 4 || x > maxX - 4) continue;
    trees.push({ x, z, h: 9 + rand() * 9, kind: Math.floor(rand() * 3) });
  }

  const windSpeed = rand() * 6;
  const windDir = rand() * Math.PI * 2;
  return {
    index,
    par,
    path,
    fairwayWidth,
    green,
    cup,
    bunkers,
    water,
    trees,
    wind: { x: Math.cos(windDir) * windSpeed, z: Math.sin(windDir) * windSpeed },
    bounds,
    length: Math.round(Math.hypot(greenX, greenZ)),
    seed: courseSeed,
  };
}

export function pointOnPath(path: readonly [number, number][], dist: number): [number, number] {
  let remaining = dist;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]!, [bx, bz] = path[i]!;
    const seg = Math.hypot(bx - ax, bz - az);
    if (remaining <= seg) {
      const u = remaining / seg;
      return [ax + (bx - ax) * u, az + (bz - az) * u];
    }
    remaining -= seg;
  }
  return path[path.length - 1]!;
}

function distToPath(path: readonly [number, number][], x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1]!, [bx, bz] = path[i]!;
    const dx = bx - ax, dz = bz - az;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - (ax + dx * u), z - (az + dz * u)));
  }
  return best;
}

function greenD(h: Hole, x: number, z: number) {
  const g = h.green;
  return Math.hypot((x - g.x) / g.rx, (z - g.z) / g.rz);
}

export function surfaceAt(h: Hole, x: number, z: number): Surface {
  const b = h.bounds;
  if (x < b.minX + 8 || x > b.maxX - 8 || z < b.minZ + 8 || z > b.maxZ - 2) return "oob";
  for (const w of h.water) if (Math.hypot(x - w.x, z - w.z) < w.r) return "water";
  const gd = greenD(h, x, z);
  if (gd < 1) return "green";
  for (const k of h.bunkers) if (Math.hypot(x - k.x, z - k.z) < k.r) return "bunker";
  if (gd < 1.18) return "fringe";
  if (Math.hypot(x, z) < 6 && Math.abs(x) < 4) return "tee";
  if (h.fairwayWidth > 0 && distToPath(h.path, x, z) < h.fairwayWidth / 2 && z < -15) return "fairway";
  return "rough";
}

/** Smooth terrain height (metres). Greens are tilted plateaus, bunkers are hollows, water is a basin. */
export function heightAt(h: Hole, x: number, z: number): number {
  const s = h.index * 1.7 + h.seed;
  let y = 2.2 * Math.sin(x * 0.021 + s) * Math.cos(z * 0.017 + s * 0.5) + 1.4 * Math.sin(z * 0.009 + s * 1.3) + 0.6 * Math.sin((x + z) * 0.05 + s);
  // Flatten near the tee.
  const tee = Math.max(0, 1 - Math.hypot(x, z) / 18);
  y = y * (1 - tee) + heightBase(h, 0, 0) * tee;
  // Green plateau with a gentle tilt.
  const g = h.green;
  const gd = greenD(h, x, z);
  const greenY = heightBase(h, g.x, g.z) + 0.6 + (x - g.x) * g.tiltX + (z - g.z) * g.tiltZ;
  const gw = gd < 1.15 ? 1 : gd < 1.9 ? 1 - smooth((gd - 1.15) / 0.75) : 0;
  y = y * (1 - gw) + greenY * gw;
  for (const k of h.bunkers) {
    const d = Math.hypot(x - k.x, z - k.z) / k.r;
    if (d < 1.15) y -= 0.55 * (1 - smooth(Math.min(1, d / 1.15)));
  }
  for (const w of h.water) {
    const d = Math.hypot(x - w.x, z - w.z) / w.r;
    if (d < 1.3) y -= 1.6 * (1 - smooth(Math.min(1, d / 1.3)));
  }
  return y;
}

function heightBase(h: Hole, x: number, z: number) {
  const s = h.index * 1.7 + h.seed;
  return 2.2 * Math.sin(x * 0.021 + s) * Math.cos(z * 0.017 + s * 0.5) + 1.4 * Math.sin(z * 0.009 + s * 1.3) + 0.6 * Math.sin((x + z) * 0.05 + s);
}

export function waterLevel(h: Hole, w: Circle): number {
  return heightBase(h, w.x, w.z) - 0.55;
}

function smooth(u: number) {
  return u * u * (3 - 2 * u);
}

export function normalAt(h: Hole, x: number, z: number): [number, number, number] {
  const e = 0.25;
  const dx = heightAt(h, x + e, z) - heightAt(h, x - e, z);
  const dz = heightAt(h, x, z + e) - heightAt(h, x, z - e);
  const nx = -dx / (2 * e), nz = -dz / (2 * e);
  const len = Math.hypot(nx, 1, nz);
  return [nx / len, 1 / len, nz / len];
}

export function distanceToCup(h: Hole, x: number, z: number) {
  return Math.hypot(x - h.cup.x, z - h.cup.z);
}

/** Course for a match: `count` holes (3, 9 or 18) from a seed, with a theme. */
export function buildCourse(count: number, seed: number) {
  return Array.from({ length: count }, (_, i) => generateHole(i, seed));
}
