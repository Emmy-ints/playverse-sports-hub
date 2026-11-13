/**
 * Bowling delivery animation for the shared humanoid: four-step approach, pushaway, pendulum
 * backswing, release at the foul line with a slide, follow-through, then a reaction.
 */
import type * as pc from "playcanvas";
import { keyframes, type Humanoid } from "../character/humanoid.ts";

export const START_Z = 3.6;
export const SLIDE_Z = 0.32;
/** Seconds from the start of the approach to the moment the ball leaves the hand. */
export const RELEASE_T = 1.72;
const APPROACH_END = 1.9;

export type Reaction = "strike" | "spare" | "good" | "miss" | null;

export class BowlerAnimator {
  private t = 0;
  private mode: "idle" | "approach" | "follow" | "react" = "idle";
  private reactT = 0;
  private reaction: Reaction = null;
  private baseX = 0;
  private released = false;
  onRelease: (() => void) | null = null;

  constructor(private h: Humanoid) {}

  /** Stand at the top of the approach holding the ball. */
  ready(laneX: number) {
    this.baseX = laneX - 0.21; // ball hangs under the right shoulder
    this.mode = "idle";
    this.t = 0;
    this.released = false;
    this.reaction = null;
    this.h.root.enabled = true;
    this.h.root.setLocalPosition(this.baseX, 0, START_Z);
    this.h.root.setLocalEulerAngles(0, 0, 0);
    this.pose(0);
  }

  start() {
    this.mode = "approach";
    this.t = 0;
    this.released = false;
  }

  react(r: Reaction) {
    this.mode = "react";
    this.reaction = r;
    this.reactT = 0;
  }

  get isHoldingBall() {
    return this.mode === "idle" || (this.mode === "approach" && !this.released);
  }

  get position() {
    return this.h.root.getPosition();
  }

  /** World position of the ball while it is held. */
  ballPosition(out: pc.Vec3) {
    // The ball sits in the palm: offset along the hand's own "down" direction.
    const hp = this.h.handR.getPosition();
    const up = this.h.handR.up;
    out.set(hp.x - up.x * 0.1, hp.y - up.y * 0.1, hp.z - up.z * 0.1);
    return out;
  }

  update(dt: number) {
    if (this.mode === "approach") {
      this.t += dt;
      this.pose(this.t);
      if (!this.released && this.t >= RELEASE_T) {
        this.released = true;
        this.onRelease?.();
      }
      if (this.t >= APPROACH_END) this.mode = "follow";
    } else if (this.mode === "follow") {
      this.t = Math.min(this.t + dt, 2.4);
      this.pose(this.t);
    } else if (this.mode === "react") {
      this.reactT += dt;
      this.reactPose(this.reactT);
    } else {
      this.t += dt;
      this.idlePose(this.t);
    }
  }

  private idlePose(t: number) {
    const h = this.h;
    const breathe = Math.sin(t * 2.2) * 1.2;
    h.spine.setLocalEulerAngles(breathe * 0.5, 0, 0);
    // Ball held at the waist, cradled by both hands.
    h.shoulderR.setLocalEulerAngles(28 + breathe, 0, 4);
    h.elbowR.setLocalEulerAngles(72, 0, 0);
    h.shoulderL.setLocalEulerAngles(30 + breathe, 0, -18);
    h.elbowL.setLocalEulerAngles(68, 0, 0);
    h.hipL.setLocalEulerAngles(0, 0, 0);
    h.hipR.setLocalEulerAngles(0, 0, 0);
    h.kneeL.setLocalEulerAngles(0, 0, 0);
    h.kneeR.setLocalEulerAngles(0, 0, 0);
    h.hips.setLocalPosition(0, 0.95, 0);
  }

  private pose(t: number) {
    const h = this.h;
    // Root travel: four steps, accelerating, then a slide.
    const z = keyframes([[0, START_Z], [0.42, START_Z - 0.55], [0.84, START_Z - 1.2], [1.26, START_Z - 2.0], [1.62, SLIDE_Z + 0.25], [1.9, SLIDE_Z]], t);
    h.root.setLocalPosition(this.baseX, 0, z);

    // Legs: alternating strides (right foot first for a right-hander), then the slide position.
    const strideT = Math.min(t, 1.55);
    const phase = (strideT / 0.42) * Math.PI;
    const swing = Math.sin(phase) * 28;
    const slide = keyframes([[1.45, 0], [1.75, 1]], t);
    const thighR = swing * (1 - slide) + -42 * slide;
    const thighL = -swing * (1 - slide) + 48 * slide;
    h.hipR.setLocalEulerAngles(thighR, 0, 0);
    h.hipL.setLocalEulerAngles(thighL, 0, 0);
    h.kneeR.setLocalEulerAngles(-Math.max(0, Math.sin(phase)) * 35 * (1 - slide) - 8 * slide, 0, 0);
    h.kneeL.setLocalEulerAngles(-Math.max(0, -Math.sin(phase)) * 35 * (1 - slide) - 62 * slide, 0, 0);
    h.hips.setLocalPosition(0, 0.95 - 0.02 * Math.abs(Math.sin(phase)) * (1 - slide) - 0.26 * slide, 0);

    // Upper body leans into the shot.
    h.spine.setLocalEulerAngles(keyframes([[0, 0], [1.2, -10], [1.75, -32], [2.4, -24]], t), 0, 0);
    h.head.setLocalEulerAngles(keyframes([[0, 0], [1.75, 22], [2.4, 14]], t), 0, 0);

    // Ball arm: pushaway → down → backswing → release → follow-through.
    h.shoulderR.setLocalEulerAngles(keyframes([[0, 28], [0.42, 58], [0.84, 0], [1.26, -78], [RELEASE_T, 8], [1.95, 75], [2.4, 135]], t), 0, 4);
    h.elbowR.setLocalEulerAngles(keyframes([[0, 72], [0.42, 12], [0.84, 0], [2.0, 0], [2.4, 25]], t), 0, 0);
    // Balance arm out to the side.
    h.shoulderL.setLocalEulerAngles(keyframes([[0, 30], [0.84, 10], [1.6, 25], [2.4, 20]], t), 0, keyframes([[0, -18], [0.84, -40], [1.7, -70], [2.4, -65]], t));
    h.elbowL.setLocalEulerAngles(keyframes([[0, 68], [0.84, 15], [2.4, 20]], t), 0, 0);
  }

  private reactPose(t: number) {
    const h = this.h;
    const ease = Math.min(1, t / 0.35);
    // Stand back up from the slide.
    h.hips.setLocalPosition(0, 0.95 - 0.26 * (1 - ease), 0);
    h.spine.setLocalEulerAngles(-24 * (1 - ease), 0, 0);
    h.hipL.setLocalEulerAngles(48 * (1 - ease), 0, 0);
    h.hipR.setLocalEulerAngles(-42 * (1 - ease), 0, 0);
    h.kneeL.setLocalEulerAngles(-62 * (1 - ease), 0, 0);
    h.kneeR.setLocalEulerAngles(0, 0, 0);
    const r = this.reaction;
    if (r === "strike") {
      // Jump with both arms up, turning to the crowd.
      const hop = Math.max(0, Math.sin(t * 9)) * 0.12 * Math.max(0, 1 - t / 2.2);
      const p = h.root.getLocalPosition();
      h.root.setLocalPosition(p.x, hop, p.z);
      h.root.setLocalEulerAngles(0, 180 * ease * Math.min(1, t / 0.8), 0);
      h.shoulderL.setLocalEulerAngles(170 * ease, 0, -15);
      h.shoulderR.setLocalEulerAngles(170 * ease, 0, 15);
      h.elbowL.setLocalEulerAngles(10, 0, 0);
      h.elbowR.setLocalEulerAngles(10, 0, 0);
      h.head.setLocalEulerAngles(-12 * ease, 0, 0);
    } else if (r === "spare" || r === "good") {
      // Fist pump.
      const pump = r === "spare" ? Math.sin(t * 10) * 20 * Math.max(0, 1 - t / 1.6) : 0;
      h.shoulderR.setLocalEulerAngles(95 * ease + pump, 0, 25);
      h.elbowR.setLocalEulerAngles(110 * ease, 0, 0);
      h.shoulderL.setLocalEulerAngles(10, 0, -10);
      h.elbowL.setLocalEulerAngles(20, 0, 0);
      h.head.setLocalEulerAngles(0, 0, 0);
    } else {
      // Disappointment: hands on head, head shake.
      h.shoulderL.setLocalEulerAngles(150 * ease, 0, -40);
      h.shoulderR.setLocalEulerAngles(150 * ease, 0, 40);
      h.elbowL.setLocalEulerAngles(120 * ease, 0, 0);
      h.elbowR.setLocalEulerAngles(120 * ease, 0, 0);
      h.head.setLocalEulerAngles(8, Math.sin(t * 7) * 18 * Math.max(0, 1 - t / 1.6), 0);
    }
  }
}
