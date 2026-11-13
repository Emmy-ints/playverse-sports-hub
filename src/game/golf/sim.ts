/**
 * Golf shot simulation: ball flight with drag, Magnus lift from backspin, curve from tilted spin axis
 * (hook/slice) and wind; then bounces and rolling governed by the surface and the terrain slope.
 * Pure TypeScript, no imports beyond the course, so the server can run the identical code.
 */
import { CUP_RADIUS, heightAt, normalAt, surfaceAt, type Hole, type Surface } from "./course.ts";

export type ClubId = "driver" | "wood3" | "iron5" | "iron7" | "iron9" | "pw" | "sw" | "putter";

export interface Club {
  id: ClubId;
  name: string;
  short: string;
  /** Ball speed at full power, m/s. */
  speed: number;
  /** Launch angle, degrees. */
  loft: number;
  /** Backspin at full power, rpm. */
  spin: number;
}

export const CLUBS: Club[] = [
  { id: "driver", name: "Driver", short: "1W", speed: 72, loft: 11, spin: 2700 },
  { id: "wood3", name: "3 Wood", short: "3W", speed: 66, loft: 13.5, spin: 3600 },
  { id: "iron5", name: "5 Iron", short: "5i", speed: 58, loft: 16, spin: 5000 },
  { id: "iron7", name: "7 Iron", short: "7i", speed: 52, loft: 19.5, spin: 6800 },
  { id: "iron9", name: "9 Iron", short: "9i", speed: 46, loft: 24, spin: 8400 },
  { id: "pw", name: "Pitching Wedge", short: "PW", speed: 41, loft: 28, spin: 9200 },
  { id: "sw", name: "Sand Wedge", short: "SW", speed: 33, loft: 34, spin: 9800 },
  { id: "putter", name: "Putter", short: "PT", speed: 9, loft: 0, spin: 0 },
];

export function getClub(id: string): Club | undefined {
  return CLUBS.find((c) => c.id === id);
}

export interface ShotInput {
  club: ClubId;
  /** Heading in radians: 0 = toward -Z, positive turns toward +X (right). */
  aim: number;
  /** 0..1 swing power. */
  power: number;
  /** -1..1 strike timing: negative = hook (curves left), positive = slice (curves right), 0 = pure. */
  accuracy: number;
}

export function isValidShot(s: unknown): s is ShotInput {
  if (!s || typeof s !== "object") return false;
  const v = s as Record<string, unknown>;
  const num = (k: string) => typeof v[k] === "number" && Number.isFinite(v[k] as number);
  return (
    typeof v["club"] === "string" &&
    !!getClub(v["club"] as string) &&
    num("aim") && Math.abs(v["aim"] as number) <= Math.PI * 2 &&
    num("power") && (v["power"] as number) >= 0.02 && (v["power"] as number) <= 1 &&
    num("accuracy") && Math.abs(v["accuracy"] as number) <= 1
  );
}

export type ShotOutcome = "holed" | "rest" | "water" | "oob";

export interface ShotResult {
  /** Ball positions [x, y, z] at 30 fps. */
  frames: number[][];
  fps: number;
  outcome: ShotOutcome;
  /** Where the next shot is played from (after penalties are applied). */
  end: { x: number; z: number; lie: Surface };
  /** Strokes added: 1 for the shot, +1 penalty for water/out of bounds. */
  strokes: number;
  carry: number;
  total: number;
  /** Frame index of first landing, -1 if none. */
  landFrame: number;
}

const G = 9.81;
const BALL_R = 0.02135;
const MASS = 0.04593;
const AREA = Math.PI * BALL_R * BALL_R;
const RHO = 1.225;
const DT = 1 / 240;
const FPS = 30;
const PER_FRAME = Math.round(1 / (DT * FPS));

/** Bounce restitution, bounce friction and rolling resistance per surface. */
const GROUND: Record<Surface, { e: number; fric: number; roll: number }> = {
  tee: { e: 0.35, fric: 0.25, roll: 0.12 },
  fairway: { e: 0.32, fric: 0.25, roll: 0.11 },
  fringe: { e: 0.28, fric: 0.3, roll: 0.09 },
  green: { e: 0.22, fric: 0.32, roll: 0.058 },
  rough: { e: 0.18, fric: 0.45, roll: 0.32 },
  bunker: { e: 0.04, fric: 0.85, roll: 1.1 },
  water: { e: 0, fric: 1, roll: 5 },
  oob: { e: 0.3, fric: 0.3, roll: 0.15 },
};

/** How well a club gets the ball out of a lie (distance factor). */
export function lieFactor(lie: Surface, club: ClubId): number {
  if (club === "putter") return lie === "green" || lie === "fringe" ? 1 : lie === "fairway" || lie === "tee" ? 0.9 : 0.55;
  if (lie === "rough") return club === "driver" ? 0.62 : 0.82;
  if (lie === "bunker") return club === "sw" ? 0.78 : club === "pw" ? 0.6 : 0.42;
  if (lie === "green") return 0.9;
  return 1;
}

export function simulateShot(hole: Hole, from: { x: number; z: number; lie: Surface }, input: ShotInput): ShotResult {
  const club = getClub(input.club)!;
  const frames: number[][] = [];
  let x = from.x, z = from.z, y = heightAt(hole, x, z) + BALL_R;
  const power = Math.max(0.02, Math.min(1, input.power));
  const acc = Math.max(-1, Math.min(1, input.accuracy));
  const lie = lieFactor(from.lie, club.id);

  // Strike quality: off-centre hits (|accuracy|) cost speed; heading starts opposite to the curve.
  const heading = input.aim + acc * (club.id === "putter" ? 0.04 : 0.035);
  const dirX = Math.sin(heading), dirZ = -Math.cos(heading);
  let speed = club.speed * power * lie * (1 - 0.12 * Math.abs(acc));
  const loft = (club.loft * (from.lie === "bunker" && club.id === "sw" ? 1.25 : 1) * Math.PI) / 180;
  let vx = dirX * speed * Math.cos(loft), vy = speed * Math.sin(loft), vz = dirZ * speed * Math.cos(loft);
  if (club.id === "putter") vy = 0;

  // Spin (rad/s): backspin axis is horizontal and perpendicular to travel; tilting it makes the ball curve.
  let spin = ((club.spin * power * (from.lie === "rough" ? 0.55 : 1)) * 2 * Math.PI) / 60;
  const tilt = acc * 0.36; // positive tilt → slice (right)
  const bx = -dirZ, bz = dirX; // dir × up: horizontal backspin axis (lift points up)
  const axis = [Math.cos(tilt) * bx, -Math.sin(tilt), Math.cos(tilt) * bz];

  const wind = hole.wind;
  let airborne = club.id !== "putter";
  let landFrame = -1;
  let carry = 0;
  let outcome: ShotOutcome = "rest";
  let lastSafe = { x, z };
  const startX = x, startZ = z;

  const push = () => frames.push([round(x), round(y), round(z)]);
  push();

  for (let step = 1; step < 240 * 25; step++) {
    if (airborne) {
      const rvx = vx - wind.x, rvy = vy, rvz = vz - wind.z;
      const v = Math.hypot(rvx, rvy, rvz) || 1e-6;
      const S = (BALL_R * spin) / v;
      const cd = 0.22 + 0.25 * Math.min(S, 0.4);
      const cl = Math.min(0.32, 0.55 * Math.pow(Math.max(S, 0), 0.4));
      const k = (0.5 * RHO * AREA) / MASS;
      // Magnus direction: axis × v.
      let mx = axis[1]! * rvz - axis[2]! * rvy;
      let my = axis[2]! * rvx - axis[0]! * rvz;
      let mz = axis[0]! * rvy - axis[1]! * rvx;
      const ml = Math.hypot(mx, my, mz) || 1;
      mx /= ml; my /= ml; mz /= ml;
      const ax = -k * cd * v * rvx + k * cl * v * v * mx;
      const ay = -G - k * cd * v * rvy + k * cl * v * v * my;
      const az = -k * cd * v * rvz + k * cl * v * v * mz;
      vx += ax * DT; vy += ay * DT; vz += az * DT;
      x += vx * DT; y += vy * DT; z += vz * DT;
      spin *= 1 - 0.035 * DT;

      const ground = heightAt(hole, x, z) + BALL_R;
      if (y <= ground) {
        y = ground;
        const surf = surfaceAt(hole, x, z);
        if (landFrame < 0) {
          landFrame = frames.length;
          carry = Math.hypot(x - startX, z - startZ);
        }
        if (surf === "water" || surf === "oob") {
          outcome = surf;
          break;
        }
        if (Math.hypot(x - hole.cup.x, z - hole.cup.z) < CUP_RADIUS * 1.5 && Math.hypot(vx, vz) < 4) {
          outcome = "holed";
          break;
        }
        // Bounce off the sloped ground.
        const [nx, ny, nz] = normalAt(hole, x, z);
        const g = GROUND[surf];
        const vn = vx * nx + vy * ny + vz * nz;
        let tx = vx - vn * nx, ty = vy - vn * ny, tz = vz - vn * nz;
        const tSpeed = Math.hypot(tx, ty, tz) || 1e-6;
        // Backspin bites on landing (wedges check up, especially on greens).
        const bite = Math.min(0.9, g.fric + (spin * BALL_R) / (tSpeed + 6) * (surf === "green" ? 0.55 : 0.3));
        tx *= 1 - bite; ty *= 1 - bite; tz *= 1 - bite;
        const out = -vn * g.e;
        vx = tx + out * nx; vy = ty + out * ny; vz = tz + out * nz;
        spin *= 0.5;
        if (out < 1.2) airborne = false;
      }
    } else {
      // Rolling along the surface.
      const surf = surfaceAt(hole, x, z);
      if (surf === "water" || surf === "oob") {
        outcome = surf;
        break;
      }
      const [nx, ny, nz] = normalAt(hole, x, z);
      const g = GROUND[surf];
      // Gravity along the slope.
      const gx = G * nx * ny, gz = G * nz * ny;
      let hv = Math.hypot(vx, vz);
      if (hv > 1e-4) {
        const decel = g.roll * G;
        const nh = Math.max(0, hv - decel * DT);
        vx *= nh / hv; vz *= nh / hv;
      }
      vx += gx * DT; vz += gz * DT;
      hv = Math.hypot(vx, vz);
      // Static friction holds the ball on gentle slopes.
      if (hv < 0.03 && Math.hypot(gx, gz) < g.roll * G * 1.05) {
        vx = 0; vz = 0;
        break;
      }
      x += vx * DT; z += vz * DT;
      y = heightAt(hole, x, z) + BALL_R;
      // Into the cup if slow enough to drop.
      if (Math.hypot(x - hole.cup.x, z - hole.cup.z) < CUP_RADIUS && hv < 1.6) {
        outcome = "holed";
        break;
      }
      vy = 0;
    }
    if (surfaceAt(hole, x, z) !== "water") lastSafe = { x, z };
    if (step % PER_FRAME === 0) push();
  }
  push();

  if (outcome === "holed") {
    x = hole.cup.x; z = hole.cup.z;
    y = heightAt(hole, x, z) - 0.05;
    frames.push([round(x), round(y), round(z)]);
    return { frames, fps: FPS, outcome, end: { x, z, lie: "green" }, strokes: 1, carry: round1(carry), total: round1(Math.hypot(x - startX, z - startZ)), landFrame };
  }
  if (outcome === "water") {
    // Drop near where it crossed into the hazard, one-stroke penalty.
    const back = dropOutsideWater(hole, lastSafe.x, lastSafe.z, startX, startZ);
    return { frames, fps: FPS, outcome, end: { x: back[0], z: back[1], lie: surfaceAt(hole, back[0], back[1]) }, strokes: 2, carry: round1(carry), total: round1(Math.hypot(x - startX, z - startZ)), landFrame };
  }
  if (outcome === "oob") {
    // Stroke and distance: replay from where the shot was hit.
    return { frames, fps: FPS, outcome, end: { x: startX, z: startZ, lie: from.lie }, strokes: 2, carry: round1(carry), total: round1(Math.hypot(x - startX, z - startZ)), landFrame };
  }
  if (landFrame < 0) carry = 0;
  return { frames, fps: FPS, outcome, end: { x: round(x), z: round(z), lie: surfaceAt(hole, x, z) }, strokes: 1, carry: round1(carry), total: round1(Math.hypot(x - startX, z - startZ)), landFrame };
}

function dropOutsideWater(hole: Hole, x: number, z: number, fromX: number, fromZ: number): [number, number] {
  // Walk back toward where the shot came from until we're on dry land.
  let px = x, pz = z;
  for (let i = 0; i < 200; i++) {
    if (surfaceAt(hole, px, pz) !== "water") break;
    const dx = fromX - px, dz = fromZ - pz;
    const d = Math.hypot(dx, dz) || 1;
    px += (dx / d) * 1.5;
    pz += (dz / d) * 1.5;
  }
  const dx = fromX - px, dz = fromZ - pz;
  const d = Math.hypot(dx, dz) || 1;
  return [round(px + (dx / d) * 2), round(pz + (dz / d) * 2)];
}

/** A sensible club for a distance (used to pre-select the club). */
export function suggestClub(distance: number, lie: Surface): ClubId {
  if (lie === "green") return "putter";
  if (lie === "bunker") return distance > 60 ? "pw" : "sw";
  if (distance < 22 && (lie === "fringe" || lie === "fairway")) return "putter";
  const table: [number, ClubId][] = [[70, "sw"], [100, "pw"], [125, "iron9"], [150, "iron7"], [175, "iron5"], [205, "wood3"]];
  for (const [d, c] of table) if (distance <= d) return c;
  return lie === "tee" ? "driver" : "wood3";
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}
function round1(n: number) {
  return Math.round(n * 10) / 10;
}
