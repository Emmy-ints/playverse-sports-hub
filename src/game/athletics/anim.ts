/** Athlete animation for the shared humanoid: set position, sprint cycle, hurdle clearance,
 *  long-jump take-off and sail, javelin carry, throw and follow-through, celebrations. */
import * as pc from "playcanvas";
import type { Humanoid } from "../character/humanoid.ts";
import type { Athlete, EventId } from "./sim.ts";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class AthleteAnimator {
  private javelin: pc.Entity | null = null;
  private t = 0;
  private landedAt = -1;
  private lean = 0;

  constructor(private h: Humanoid, javelinMat?: pc.Material, tipMat?: pc.Material) {
    if (javelinMat && tipMat) {
      const j = new pc.Entity("javelin-held");
      const shaft = new pc.Entity();
      shaft.addComponent("render", { type: "cylinder", material: javelinMat, castShadows: true });
      shaft.setLocalScale(0.028, 2.6, 0.028);
      j.addChild(shaft);
      const tip = new pc.Entity();
      tip.addComponent("render", { type: "cone", material: tipMat, castShadows: true });
      tip.setLocalScale(0.03, 0.22, 0.03);
      tip.setLocalPosition(0, 1.4, 0);
      j.addChild(tip);
      h.handR.addChild(j);
      j.setLocalPosition(0, -0.05, 0);
      this.javelin = j;
      j.enabled = false;
    }
  }

  setJavelinVisible(on: boolean) {
    if (this.javelin) this.javelin.enabled = on;
  }

  /** `celebrate`: 1 winner, 0.5 podium, 0 normal, -1 dejected. */
  update(a: Athlete, event: EventId, dt: number, celebrate: number) {
    this.t += dt;
    const h = this.h;
    const speed = a.v;
    const run = Math.min(1, speed / 10);
    const s = a.stride;
    const cyc = Math.sin(s);
    this.lean = lerp(this.lean, a.phase === "running" ? -8 - run * 14 : 0, Math.min(1, dt * 6));
    if (this.javelin) this.javelin.setLocalEulerAngles(0, 0, 0);

    if (a.phase === "marks" && speed < 0.2) {
      if (event === "sprint100" || event === "hurdles110") return this.setPosition();
      return this.ready(event);
    }
    if (a.phase === "running" || (a.phase === "done" && speed > 0.5)) {
      // Sprint cycle: big knee drive and arm pump scale with speed.
      h.hips.setLocalPosition(0, 0.92 - run * 0.04 + Math.abs(Math.cos(s)) * 0.05 * run, 0);
      h.spine.setLocalEulerAngles(this.lean, cyc * 6 * run, 0);
      h.head.setLocalEulerAngles(-this.lean * 0.6, 0, 0);
      const amp = 25 + 50 * run;
      h.hipL.setLocalEulerAngles(cyc * amp + 10 * run, 0, -3);
      h.hipR.setLocalEulerAngles(-cyc * amp + 10 * run, 0, 3);
      h.kneeL.setLocalEulerAngles(-(20 + Math.max(0, -cyc) * (40 + 70 * run)), 0, 0);
      h.kneeR.setLocalEulerAngles(-(20 + Math.max(0, cyc) * (40 + 70 * run)), 0, 0);
      const arm = 20 + 55 * run;
      if (event === "javelin") {
        // Javelin carried over the shoulder.
        h.shoulderR.setLocalEulerAngles(150, 0, 15);
        h.elbowR.setLocalEulerAngles(80, 0, 0);
        h.shoulderL.setLocalEulerAngles(cyc * arm, 0, -10);
        h.elbowL.setLocalEulerAngles(70, 0, 0);
        this.javelin?.setLocalEulerAngles(-90, 0, 0);
      } else {
        h.shoulderL.setLocalEulerAngles(-cyc * arm, 0, -8);
        h.shoulderR.setLocalEulerAngles(cyc * arm, 0, 8);
        h.elbowL.setLocalEulerAngles(70 + run * 20, 0, 0);
        h.elbowR.setLocalEulerAngles(70 + run * 20, 0, 0);
      }
      this.landedAt = -1;
      return;
    }
    if (a.phase === "air") {
      // Hurdle clearance: lead leg straight, trail leg tucked, opposite arm forward.
      const k = Math.min(1, a.airT / Math.max(0.01, a.airDur));
      h.hips.setLocalPosition(0, 0.9, 0);
      h.spine.setLocalEulerAngles(-28, 0, 0);
      h.hipL.setLocalEulerAngles(80 - k * 60, 0, -4);
      h.kneeL.setLocalEulerAngles(-5 - k * 30, 0, 0);
      h.hipR.setLocalEulerAngles(-30, 0, 55 * (1 - k));
      h.kneeR.setLocalEulerAngles(-100, 0, 0);
      h.shoulderR.setLocalEulerAngles(70, 0, 10);
      h.shoulderL.setLocalEulerAngles(-30, 0, -15);
      h.elbowR.setLocalEulerAngles(20, 0, 0);
      h.elbowL.setLocalEulerAngles(60, 0, 0);
      return;
    }
    if (a.phase === "aiming") {
      if (event === "longjump") {
        // Penultimate step and drive off the board.
        h.spine.setLocalEulerAngles(-5, 0, 0);
        h.hipL.setLocalEulerAngles(70, 0, 0);
        h.kneeL.setLocalEulerAngles(-80, 0, 0);
        h.hipR.setLocalEulerAngles(-20, 0, 0);
        h.kneeR.setLocalEulerAngles(-10, 0, 0);
        h.shoulderL.setLocalEulerAngles(120, 0, -20);
        h.shoulderR.setLocalEulerAngles(120, 0, 20);
      } else {
        // Javelin withdrawal: arm fully back, body side-on, crossover steps.
        h.spine.setLocalEulerAngles(10, -55, 0);
        h.shoulderR.setLocalEulerAngles(-20, 0, 80);
        h.elbowR.setLocalEulerAngles(5, 0, 0);
        h.shoulderL.setLocalEulerAngles(90, 0, -20);
        h.hipL.setLocalEulerAngles(Math.sin(this.t * 14) * 35, 0, 0);
        h.hipR.setLocalEulerAngles(-Math.sin(this.t * 14) * 35, 0, 0);
        this.javelin?.setLocalEulerAngles(-90, 0, 0);
      }
      return;
    }
    if (a.phase === "flight") {
      if (event === "longjump") {
        // Hang/sail, then legs forward for landing.
        const k = Math.min(1, a.airT / Math.max(0.01, a.airDur));
        h.hips.setLocalPosition(0, 0.9 + a.y, 0);
        h.spine.setLocalEulerAngles(lerp(-10, -35, k), 0, 0);
        h.hipL.setLocalEulerAngles(lerp(20, 95, k), 0, -5);
        h.hipR.setLocalEulerAngles(lerp(-30, 95, k), 0, 5);
        h.kneeL.setLocalEulerAngles(lerp(-60, -10, k), 0, 0);
        h.kneeR.setLocalEulerAngles(lerp(-90, -10, k), 0, 0);
        h.shoulderL.setLocalEulerAngles(lerp(160, 40, k), 0, -30);
        h.shoulderR.setLocalEulerAngles(lerp(160, 40, k), 0, 30);
        h.elbowL.setLocalEulerAngles(10, 0, 0);
        h.elbowR.setLocalEulerAngles(10, 0, 0);
      } else {
        // Throw follow-through, then watch the javelin.
        h.spine.setLocalEulerAngles(-25, 25, 0);
        h.shoulderR.setLocalEulerAngles(140, 0, -20);
        h.elbowR.setLocalEulerAngles(10, 0, 0);
        h.shoulderL.setLocalEulerAngles(-10, 0, -40);
        h.hipL.setLocalEulerAngles(30, 0, 0);
        h.hipR.setLocalEulerAngles(-20, 0, 0);
        h.kneeL.setLocalEulerAngles(-10, 0, 0);
        h.kneeR.setLocalEulerAngles(-40, 0, 0);
      }
      return;
    }
    // Done / idle: reaction.
    if (this.landedAt < 0) this.landedAt = this.t;
    const rt = this.t - this.landedAt;
    if (event === "longjump" && a.phase === "done" && rt < 0.8) {
      // Sitting in the sand after landing.
      h.hips.setLocalPosition(0, 0.35, 0);
      h.hipL.setLocalEulerAngles(80, 0, -10);
      h.hipR.setLocalEulerAngles(80, 0, 10);
      h.kneeL.setLocalEulerAngles(-20, 0, 0);
      h.kneeR.setLocalEulerAngles(-20, 0, 0);
      return;
    }
    h.hips.setLocalPosition(0, 0.95, 0);
    h.spine.setLocalEulerAngles(celebrate < 0 ? -25 : 0, 0, 0);
    h.hipL.setLocalEulerAngles(0, 0, -4);
    h.hipR.setLocalEulerAngles(0, 0, 4);
    h.kneeL.setLocalEulerAngles(celebrate < 0 ? -25 : 0, 0, 0);
    h.kneeR.setLocalEulerAngles(celebrate < 0 ? -25 : 0, 0, 0);
    if (celebrate >= 0.5) {
      const pump = Math.sin(this.t * 8) * 20;
      h.shoulderL.setLocalEulerAngles(160 + pump, 0, -25);
      h.shoulderR.setLocalEulerAngles(160 - pump, 0, 25);
      h.elbowL.setLocalEulerAngles(20, 0, 0);
      h.elbowR.setLocalEulerAngles(20, 0, 0);
      h.head.setLocalEulerAngles(-15, 0, 0);
      h.hips.setLocalPosition(0, 0.95 + (celebrate >= 1 ? Math.max(0, Math.sin(this.t * 8)) * 0.12 : 0), 0);
    } else if (celebrate < 0) {
      h.shoulderL.setLocalEulerAngles(40, 0, 0);
      h.shoulderR.setLocalEulerAngles(40, 0, 0);
      h.elbowL.setLocalEulerAngles(10, 0, 0);
      h.elbowR.setLocalEulerAngles(10, 0, 0);
      h.head.setLocalEulerAngles(20, 0, 0);
    } else {
      h.shoulderL.setLocalEulerAngles(5, 0, -8);
      h.shoulderR.setLocalEulerAngles(5, 0, 8);
      h.elbowL.setLocalEulerAngles(15, 0, 0);
      h.elbowR.setLocalEulerAngles(15, 0, 0);
      h.head.setLocalEulerAngles(Math.sin(this.t * 0.7) * 5, 0, 0);
    }
  }

  /** Crouched "set" position in the blocks. */
  private setPosition() {
    const h = this.h;
    const b = Math.sin(this.t * 2) * 0.01;
    h.hips.setLocalPosition(0, 0.62 + b, 0.1);
    h.spine.setLocalEulerAngles(-70, 0, 0);
    h.head.setLocalEulerAngles(40, 0, 0);
    h.hipL.setLocalEulerAngles(80, 0, -4);
    h.kneeL.setLocalEulerAngles(-95, 0, 0);
    h.hipR.setLocalEulerAngles(40, 0, 4);
    h.kneeR.setLocalEulerAngles(-60, 0, 0);
    h.shoulderL.setLocalEulerAngles(70, 0, -6);
    h.shoulderR.setLocalEulerAngles(70, 0, 6);
    h.elbowL.setLocalEulerAngles(0, 0, 0);
    h.elbowR.setLocalEulerAngles(0, 0, 0);
  }

  private ready(event: EventId) {
    const h = this.h;
    const b = Math.sin(this.t * 3) * 0.015;
    h.hips.setLocalPosition(0, 0.94 + b, 0);
    h.spine.setLocalEulerAngles(-6, 0, 0);
    h.head.setLocalEulerAngles(-4, 0, 0);
    h.hipL.setLocalEulerAngles(18, 0, -3);
    h.hipR.setLocalEulerAngles(-8, 0, 3);
    h.kneeL.setLocalEulerAngles(-15, 0, 0);
    h.kneeR.setLocalEulerAngles(-8, 0, 0);
    if (event === "javelin") {
      h.shoulderR.setLocalEulerAngles(150, 0, 15);
      h.elbowR.setLocalEulerAngles(80, 0, 0);
      this.javelin?.setLocalEulerAngles(-90, 0, 0);
    } else {
      h.shoulderR.setLocalEulerAngles(10, 0, 8);
      h.elbowR.setLocalEulerAngles(30, 0, 0);
    }
    h.shoulderL.setLocalEulerAngles(10, 0, -8);
    h.elbowL.setLocalEulerAngles(30, 0, 0);
  }
}
