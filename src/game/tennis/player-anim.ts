/**
 * Tennis animation for the shared humanoid: ready stance, side-shuffle/run cycle, forehand and
 * backhand swings, the serve, and a racket held in the right hand. Driven purely by the simulation
 * state (position, velocity, last swing and its time), so it looks the same online and offline.
 */
import * as pc from "playcanvas";
import { keyframes, type Humanoid } from "../character/humanoid.ts";

export interface AnimInput {
  x: number;
  z: number;
  vx: number;
  vz: number;
  swing: "fh" | "bh" | "serve" | "";
  swingAt: number;
  armed: boolean;
  /** Serving and waiting to toss. */
  serving: boolean;
  /** Which way the player faces: -1 toward −Z (player 0), +1 toward +Z (player 1). */
  facing: 1 | -1;
}

const SWING_T = 0.55;
const SERVE_T = 0.75;

export class TennisPlayerAnimator {
  private stride = 0;
  private racket: pc.Entity;
  private lastSwingAt = -10;
  private swingStart = -10;

  constructor(private h: Humanoid, mats: { frame: pc.Material; strings: pc.Material; grip: pc.Material }) {
    this.racket = new pc.Entity("racket");
    h.handR.addChild(this.racket);
    const add = (type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number]) => {
      const e = new pc.Entity();
      e.addComponent("render", { type, material: m, castShadows: true, receiveShadows: false });
      e.setLocalPosition(...pos);
      e.setLocalScale(...scale);
      if (rot) e.setLocalEulerAngles(...rot);
      this.racket.addChild(e);
      return e;
    };
    add("cylinder", mats.grip, [0, -0.08, 0], [0.034, 0.2, 0.034]);
    add("cylinder", mats.frame, [0, -0.24, 0], [0.018, 0.16, 0.018]);
    // Head: an oval frame (torus) with a string bed, in the plane of the hand.
    add("torus", mats.frame, [0, -0.47, 0], [0.27, 0.025, 0.34], [90, 0, 0]);
    add("box", mats.strings, [0, -0.47, 0], [0.22, 0.3, 0.004]);
  }

  /** `now` is simulation time (same clock as swingAt); dt is the frame time. */
  update(a: AnimInput, now: number, dt: number) {
    const h = this.h;
    h.root.setPosition(a.x, 0, a.z);
    h.root.setEulerAngles(0, a.facing < 0 ? 0 : 180, 0);
    if (a.swingAt !== this.lastSwingAt) {
      this.lastSwingAt = a.swingAt;
      this.swingStart = now;
    }
    const speed = Math.hypot(a.vx, a.vz);
    this.stride += dt * (2 + speed * 2.2);
    const run = Math.min(1, speed / 4);

    // Legs: athletic ready stance, cycling while moving.
    const cyc = Math.sin(this.stride * 2.4);
    h.hips.setLocalPosition(0, 0.9 - 0.06 * (1 - run) + Math.abs(cyc) * 0.03 * run, 0);
    h.hipL.setLocalEulerAngles(16 + cyc * 38 * run, 0, -6);
    h.hipR.setLocalEulerAngles(16 - cyc * 38 * run, 0, 6);
    h.kneeL.setLocalEulerAngles(-26 - Math.max(0, -cyc) * 45 * run, 0, 0);
    h.kneeR.setLocalEulerAngles(-26 - Math.max(0, cyc) * 45 * run, 0, 0);

    const since = now - this.swingStart;
    const swinging = a.swing !== "" && since >= 0 && since < (a.swing === "serve" ? SERVE_T : SWING_T);
    if (swinging) {
      if (a.swing === "serve") this.serve(since);
      else this.groundstroke(a.swing, since);
      return;
    }
    if (a.serving) return this.trophy();
    // Ready position, or the backswing when a shot is armed.
    const prep = a.armed ? 1 : 0;
    h.spine.setLocalEulerAngles(-14, -40 * prep, 0);
    h.head.setLocalEulerAngles(-4, 30 * prep, 0);
    h.shoulderR.setLocalEulerAngles(35 - 45 * prep, 0, 22 + 40 * prep);
    h.elbowR.setLocalEulerAngles(70 - 30 * prep, 0, 0);
    h.shoulderL.setLocalEulerAngles(45 + cyc * 20 * run, 0, -15);
    h.elbowL.setLocalEulerAngles(70, 0, 0);
    this.racket.setLocalEulerAngles(60 + 30 * prep, 0, 0);
  }

  private groundstroke(kind: "fh" | "bh", t: number) {
    const h = this.h;
    // t = 0 is the moment of contact; play a short burst of backswing remainder → follow-through.
    const k = (keys: [number, number][]) => keyframes(keys, t);
    if (kind === "fh") {
      h.spine.setLocalEulerAngles(-12, k([[0, -20], [0.18, 45], [SWING_T, 30]]), 0);
      h.shoulderR.setLocalEulerAngles(k([[0, 30], [0.2, 110], [SWING_T, 90]]), 0, k([[0, 75], [0.2, 10], [SWING_T, 15]]));
      h.elbowR.setLocalEulerAngles(k([[0, 15], [0.2, 75], [SWING_T, 70]]), 0, 0);
      h.shoulderL.setLocalEulerAngles(k([[0, 70], [0.2, 20], [SWING_T, 30]]), 0, -40);
      h.elbowL.setLocalEulerAngles(50, 0, 0);
      this.racket.setLocalEulerAngles(k([[0, 80], [0.2, 120], [SWING_T, 100]]), 0, 0);
    } else {
      h.spine.setLocalEulerAngles(-12, k([[0, 35], [0.2, -35], [SWING_T, -25]]), 0);
      h.shoulderR.setLocalEulerAngles(k([[0, 45], [0.2, 130], [SWING_T, 115]]), 0, k([[0, -55], [0.2, 40], [SWING_T, 35]]));
      h.elbowR.setLocalEulerAngles(k([[0, 10], [0.2, 15], [SWING_T, 25]]), 0, 0);
      h.shoulderL.setLocalEulerAngles(k([[0, 40], [0.2, -30], [SWING_T, -20]]), 0, k([[0, -20], [0.2, -45], [SWING_T, -40]]));
      h.elbowL.setLocalEulerAngles(20, 0, 0);
      this.racket.setLocalEulerAngles(k([[0, 85], [0.2, 100], [SWING_T, 95]]), 0, 0);
    }
    h.head.setLocalEulerAngles(-6, 0, 0);
  }

  private trophy() {
    const h = this.h;
    h.spine.setLocalEulerAngles(-4, -30, 0);
    h.head.setLocalEulerAngles(-10, 25, 0);
    h.shoulderL.setLocalEulerAngles(40, 0, -10);
    h.elbowL.setLocalEulerAngles(30, 0, 0);
    h.shoulderR.setLocalEulerAngles(20, 0, 25);
    h.elbowR.setLocalEulerAngles(40, 0, 0);
    this.racket.setLocalEulerAngles(40, 0, 0);
  }

  private serve(t: number) {
    const h = this.h;
    const k = (keys: [number, number][]) => keyframes(keys, t);
    h.spine.setLocalEulerAngles(k([[0, 12], [0.12, -5], [0.4, -30], [SERVE_T, -20]]), k([[0, -30], [0.14, 10], [SERVE_T, 20]]), 0);
    h.head.setLocalEulerAngles(k([[0, 30], [0.14, 10], [0.4, -10]]), 0, 0);
    h.shoulderL.setLocalEulerAngles(k([[0, 170], [0.14, 120], [0.4, 30], [SERVE_T, 20]]), 0, -10);
    h.elbowL.setLocalEulerAngles(10, 0, 0);
    h.shoulderR.setLocalEulerAngles(k([[0, 160], [0.08, 175], [0.3, 70], [SERVE_T, 25]]), 0, k([[0, 35], [0.14, 5], [0.4, -40], [SERVE_T, -30]]));
    h.elbowR.setLocalEulerAngles(k([[0, 120], [0.08, 5], [SERVE_T, 20]]), 0, 0);
    this.racket.setLocalEulerAngles(k([[0, 20], [0.1, 5], [0.4, 70], [SERVE_T, 60]]), 0, 0);
  }
}
