/**
 * Regulation ten-pin bowling geometry (USBC specifications), in metres and kilograms.
 * Coordinate system: the bowler faces -Z. The foul line is at z = 0, the lane surface at y = 0,
 * the centre of the lane at x = 0 (bowler's left is -X).
 *
 * This file has no imports so it can be shared by the browser and the server (Deno) simulation.
 */
export const INCH = 0.0254;

export const LANE = {
  width: 41.5 * INCH, // 1.0541 m
  foulLineToHeadPin: 60 * 12 * INCH, // 18.288 m
  approachLength: 15 * 12 * INCH, // behind the foul line
  gutterWidth: 9.25 * INCH,
  gutterDepth: 1.875 * INCH,
  pinDeckLength: 34.1875 * INCH, // head pin centre to the pit edge
  pitDepth: 0.35,
  pitLength: 0.75,
  kickbackHeight: 0.6,
  /** Length of the oil pattern from the foul line (a typical "house shot"). */
  oilLength: 40 * 12 * INCH,
} as const;

export const BALL = {
  radius: 8.595 * INCH / 2, // 21.83 cm diameter
  mass: 6.8, // 15 lb
} as const;

export const PIN = {
  height: 15 * INCH,
  mass: 1.53, // 3 lb 6 oz
  spacing: 12 * INCH,
} as const;

export const HEAD_PIN_Z = -LANE.foulLineToHeadPin;
export const PIT_EDGE_Z = HEAD_PIN_Z - LANE.pinDeckLength;
export const HALF_LANE = LANE.width / 2;
export const GUTTER_OUTER = HALF_LANE + LANE.gutterWidth;

/** Pin spots 1..10, as [x, z]. Standard triangle: 12" between centres, rows 10.392" apart. */
export const PIN_SPOTS: ReadonlyArray<readonly [number, number]> = (() => {
  const s = PIN.spacing;
  const row = s * Math.sin(Math.PI / 3);
  const z = (r: number) => HEAD_PIN_Z - r * row;
  return [
    [0, z(0)], // 1
    [-s / 2, z(1)], // 2
    [s / 2, z(1)], // 3
    [-s, z(2)], // 4
    [0, z(2)], // 5
    [s, z(2)], // 6
    [-1.5 * s, z(3)], // 7
    [-s / 2, z(3)], // 8
    [s / 2, z(3)], // 9
    [1.5 * s, z(3)], // 10
  ] as const;
})();

/**
 * Pin profile as [height, radius] pairs, from the USBC pin specification (diameters at heights),
 * converted to metres. Used both for the visual mesh (lathe) and the physics convex hull.
 */
export const PIN_PROFILE: ReadonlyArray<readonly [number, number]> = (
  [
    [0, 2.03],
    [0.375, 2.6],
    [0.75, 2.83],
    [1.5, 3.42],
    [2.25, 3.91],
    [3.375, 4.51],
    [4.5, 4.77],
    [5.875, 4.56],
    [7.25, 3.7],
    [8.625, 2.47],
    [9.375, 1.95],
    [10, 1.8],
    [10.875, 1.9],
    [11.75, 2.31],
    [12.5, 2.54],
    [13.5, 2.55],
    [14.0, 2.42],
    [14.5, 2.0],
    [14.8, 1.35],
    [15, 0],
  ] as const
).map(([h, d]) => [h * INCH, (d / 2) * INCH] as const);

/** Throw input limits; the server rejects anything outside these. */
export const THROW_LIMITS = {
  minSpeed: 4.5, // m/s (~10 mph)
  maxSpeed: 10.5, // m/s (~23.5 mph)
  maxAngle: 0.07, // radians either side of straight (~4°)
  maxStartX: HALF_LANE - BALL.radius,
  maxSpin: 1,
} as const;

export interface ThrowInput {
  /** Release position across the lane, metres from centre (bowler's left negative). */
  x: number;
  /** Launch speed, m/s. */
  speed: number;
  /** Launch angle in radians; positive aims right (+X). */
  angle: number;
  /** -1..1. Positive hooks the ball to the left (a right-hander's hook). */
  spin: number;
}

export function isValidThrow(t: unknown): t is ThrowInput {
  if (!t || typeof t !== "object") return false;
  const v = t as Record<string, unknown>;
  const n = (k: string) => typeof v[k] === "number" && Number.isFinite(v[k] as number);
  if (!n("x") || !n("speed") || !n("angle") || !n("spin")) return false;
  const x = v["x"] as number, speed = v["speed"] as number, angle = v["angle"] as number, spin = v["spin"] as number;
  return (
    Math.abs(x) <= THROW_LIMITS.maxStartX + 1e-9 &&
    speed >= THROW_LIMITS.minSpeed &&
    speed <= THROW_LIMITS.maxSpeed &&
    Math.abs(angle) <= THROW_LIMITS.maxAngle + 1e-9 &&
    Math.abs(spin) <= THROW_LIMITS.maxSpin + 1e-9
  );
}
