/**
 * Rigid-body bowling simulation using Rapier. The Rapier module is passed in so the same file runs
 * in the browser (practice) and on the server (authoritative online throws, Deno edge function).
 *
 * The ball and pins are real dynamic bodies: hook comes from side spin meeting lane friction
 * (an oiled front section and dry back end), and pin action comes from collisions — nothing is scripted.
 */
import {
  BALL,
  GUTTER_OUTER,
  HALF_LANE,
  HEAD_PIN_Z,
  LANE,
  PIN,
  PIN_PROFILE,
  PIN_SPOTS,
  PIT_EDGE_Z,
  type ThrowInput,
} from "./constants.ts";

// Rapier's types aren't imported so this file stays runtime-agnostic.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rapier = any;

export const SIM_FPS = 30;
const STEP_HZ = 120;
const RECORD_EVERY = STEP_HZ / SIM_FPS;
const MAX_SECONDS = 8;
const SETTLE_SECONDS = 1.6;

export const FRICTION = { oil: 0.012, dry: 0.16, deck: 0.3, pin: 0.32, gutter: 0.2 } as const;
const MAX_SPIN_RAD_S = 26;

export interface SimResult {
  /** Pins (1..10) that were standing before the throw, in the order they appear in each frame. */
  pins: number[];
  /** Each frame: ball [x,y,z,qx,qy,qz,qw] followed by the same 7 numbers for every pin in `pins`. */
  frames: number[][];
  fps: number;
  /** Pins knocked down by this ball. */
  knocked: number[];
  /** Pins still standing afterwards. */
  standing: number[];
  /** Frame index at which the ball first reaches the pins (for impact sound/camera), or -1. */
  impactFrame: number;
  /** True if the ball dropped into a gutter before the pin deck. */
  gutter: boolean;
}

/** Points on the pin's surface (body origin at the base centre), for the convex hull. */
export function pinHullPoints(segments = 14): Float32Array {
  const pts: number[] = [];
  for (const [h, r] of PIN_PROFILE) {
    if (r === 0) {
      pts.push(0, h, 0);
      continue;
    }
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      pts.push(Math.cos(a) * r, h, Math.sin(a) * r);
    }
  }
  return new Float32Array(pts);
}

function addStaticBox(R: Rapier, world: Rapier, body: Rapier, hx: number, hy: number, hz: number, x: number, y: number, z: number, friction: number, restitution = 0.1) {
  world.createCollider(
    R.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setFriction(friction)
      .setFrictionCombineRule(R.CoefficientCombineRule.Min)
      .setRestitution(restitution),
    body,
  );
}

function buildAlley(R: Rapier, world: Rapier) {
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed());
  const t = 0.05; // half thickness of slabs
  const deckStart = HEAD_PIN_Z + 0.25;
  // Approach + oiled front of the lane.
  const oilEnd = -LANE.oilLength;
  addStaticBox(R, world, ground, HALF_LANE, t, (2 - oilEnd) / 2, 0, -t, (2 + oilEnd) / 2, FRICTION.oil);
  // Dry back end.
  addStaticBox(R, world, ground, HALF_LANE, t, (oilEnd - deckStart) / 2, 0, -t, (oilEnd + deckStart) / 2, FRICTION.dry);
  // Pin deck.
  addStaticBox(R, world, ground, HALF_LANE, t, (deckStart - PIT_EDGE_Z) / 2, 0, -t, (deckStart + PIT_EDGE_Z) / 2, FRICTION.deck, 0.2);
  // Gutters (lower channels either side) running to the pit.
  const gutterLen = (2 - PIT_EDGE_Z) / 2;
  const gutterMidZ = (2 + PIT_EDGE_Z) / 2;
  const gx = HALF_LANE + LANE.gutterWidth / 2;
  for (const side of [-1, 1]) {
    addStaticBox(R, world, ground, LANE.gutterWidth / 2, t, gutterLen, side * gx, -LANE.gutterDepth - t, gutterMidZ, FRICTION.gutter);
    // Divider / kickback walls on the outside of the gutters.
    addStaticBox(R, world, ground, 0.03, LANE.kickbackHeight / 2, gutterLen + LANE.pitLength / 2, side * (GUTTER_OUTER + 0.03), LANE.kickbackHeight / 2 - LANE.gutterDepth, gutterMidZ - LANE.pitLength / 2, 0.3, 0.35);
  }
  // Pit floor and back cushion (absorbs energy).
  const pitMidZ = PIT_EDGE_Z - LANE.pitLength / 2;
  addStaticBox(R, world, ground, GUTTER_OUTER, t, LANE.pitLength / 2, 0, -LANE.pitDepth - t, pitMidZ, 0.6, 0.05);
  addStaticBox(R, world, ground, GUTTER_OUTER, 0.6, 0.05, 0, 0.6 - LANE.pitDepth, PIT_EDGE_Z - LANE.pitLength - 0.05, 0.6, 0.02);
}

function readPose(body: Rapier, out: number[]) {
  const p = body.translation();
  const q = body.rotation();
  out.push(round(p.x), round(p.y), round(p.z), round(q.x), round(q.y), round(q.z), round(q.w));
}

function round(n: number) {
  return Math.round(n * 10000) / 10000;
}

export function isPinStanding(pos: { x: number; y: number; z: number }, rot: { x: number; z: number }): boolean {
  const upY = 1 - 2 * (rot.x * rot.x + rot.z * rot.z);
  return upY > 0.85 && pos.y > -0.03 && pos.y < 0.05 && pos.z > PIT_EDGE_Z && Math.abs(pos.x) < GUTTER_OUTER;
}

/**
 * Simulate one ball against the given standing pins (1..10). Standing pins are placed on their spots,
 * as a pinsetter does before the next ball.
 */
export function simulateThrow(R: Rapier, input: ThrowInput, standingPins: readonly number[]): SimResult {
  const world = new R.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = 1 / STEP_HZ;
  try {
    buildAlley(R, world);

    const hull = pinHullPoints();
    const pinBodies: { id: number; body: Rapier }[] = [];
    for (const id of [...standingPins].sort((a, b) => a - b)) {
      const spot = PIN_SPOTS[id - 1];
      if (!spot) continue;
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(spot[0], 0.0005, spot[1]).setCanSleep(true).setSleeping(true));
      const desc = R.ColliderDesc.convexHull(hull);
      if (!desc) throw new Error("pin hull failed");
      world.createCollider(desc.setMass(PIN.mass).setFriction(FRICTION.pin).setRestitution(0.45), body);
      pinBodies.push({ id, body });
    }

    const speed = input.speed;
    const vx = speed * Math.sin(input.angle);
    const vz = -speed * Math.cos(input.angle);
    const r = BALL.radius;
    const ball = world.createRigidBody(
      R.RigidBodyDesc.dynamic()
        .setTranslation(input.x, r + 0.001, -0.25)
        .setLinvel(vx, 0, vz)
        // Partial forward roll (the ball skids first) plus side rotation, which creates the hook.
        .setAngvel({ x: (0.35 * vz) / r, y: 0, z: input.spin * MAX_SPIN_RAD_S })
        .setCcdEnabled(true)
        .setAngularDamping(0.05),
    );
    world.createCollider(
      R.ColliderDesc.ball(r).setMass(BALL.mass).setFriction(1).setFrictionCombineRule(R.CoefficientCombineRule.Min).setRestitution(0.05),
      ball,
    );

    const frames: number[][] = [];
    let impactFrame = -1;
    let gutter = false;
    let goneAt = -1;
    const maxSteps = MAX_SECONDS * STEP_HZ;

    for (let step = 0; step <= maxSteps; step++) {
      if (step % RECORD_EVERY === 0) {
        const f: number[] = [];
        readPose(ball, f);
        for (const p of pinBodies) readPose(p.body, f);
        frames.push(f);
      }
      const bp = ball.translation();
      if (impactFrame < 0 && bp.z < HEAD_PIN_Z + 0.25) impactFrame = frames.length - 1;
      if (!gutter && bp.z > HEAD_PIN_Z + 0.25 && Math.abs(bp.x) > HALF_LANE + 0.02 && bp.y < r - 0.01) gutter = true;
      if (goneAt < 0 && (bp.z < PIT_EDGE_Z - 0.2 || bp.y < -0.15)) goneAt = step;
      if (goneAt >= 0) {
        const settled = pinBodies.every((p) => p.body.isSleeping() || magnitude(p.body.linvel()) + magnitude(p.body.angvel()) < 0.05);
        if (step - goneAt > SETTLE_SECONDS * STEP_HZ || (settled && step - goneAt > 0.6 * STEP_HZ)) break;
      }
      world.step();
    }

    const standing: number[] = [];
    const knocked: number[] = [];
    for (const p of pinBodies) {
      (isPinStanding(p.body.translation(), p.body.rotation()) ? standing : knocked).push(p.id);
    }
    return { pins: pinBodies.map((p) => p.id), frames, fps: SIM_FPS, knocked, standing, impactFrame, gutter };
  } finally {
    world.free();
  }
}

function magnitude(v: { x: number; y: number; z: number }) {
  return Math.hypot(v.x, v.y, v.z);
}
