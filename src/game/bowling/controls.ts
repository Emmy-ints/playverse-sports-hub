import { THROW_LIMITS, type ThrowInput } from "./constants.ts";

export interface SwipeSample { x: number; y: number; t: number }

/**
 * Turn a swipe (pointer path, screen pixels) into a throw.
 * Up-swipe speed → ball speed; overall direction → aim; sideways curl at the end → spin.
 * Returns null if the gesture isn't an upward swipe.
 */
export function swipeToThrow(path: readonly SwipeSample[], viewport: { width: number; height: number }, startX: number): ThrowInput | null {
  if (path.length < 3) return null;
  const first = path[0]!, last = path[path.length - 1]!;
  const dy = first.y - last.y; // upward is positive
  const dx = last.x - first.x;
  const dt = Math.max(16, last.t - first.t);
  if (dy < viewport.height * 0.12) return null;

  const pxPerMs = Math.hypot(dx, dy) / dt;
  // ~0.6 px/ms is a gentle swipe, ~3 px/ms is a hard flick (scaled to screen height).
  const norm = Math.min(1, Math.max(0, (pxPerMs / (viewport.height / 700) - 0.6) / 2.4));
  const speed = THROW_LIMITS.minSpeed + norm * (THROW_LIMITS.maxSpeed - THROW_LIMITS.minSpeed);

  const angle = clamp((Math.atan2(dx, dy) * 0.25), -THROW_LIMITS.maxAngle, THROW_LIMITS.maxAngle);

  // Curl: compare the direction of the first and last thirds of the swipe.
  const third = Math.max(1, Math.floor(path.length / 3));
  const a0 = path[0]!, a1 = path[third]!, b0 = path[path.length - 1 - third]!, b1 = last;
  const dirA = Math.atan2(a1.x - a0.x, a0.y - a1.y);
  const dirB = Math.atan2(b1.x - b0.x, b0.y - b1.y);
  // Curling the swipe to the left (dirB < dirA) hooks the ball left (positive spin).
  const spin = clamp((dirA - dirB) * 1.6, -1, 1);

  return { x: clamp(startX, -THROW_LIMITS.maxStartX, THROW_LIMITS.maxStartX), speed, angle, spin };
}

/** Power meter value (0..1) for a hold of `ms` milliseconds: sweeps up and down every 1.6 s. */
export function powerAt(ms: number): number {
  const period = 1600;
  const p = (ms % period) / period;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

export function powerToSpeed(p: number): number {
  return THROW_LIMITS.minSpeed + clamp(p, 0, 1) * (THROW_LIMITS.maxSpeed - THROW_LIMITS.minSpeed);
}

export function clamp(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}
