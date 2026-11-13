/** Parkour animation for the shared humanoid: run, take-off and tuck, vault, slide, climb,
 *  stumble, fall, and finish celebration. Poses are procedural and blended for smoothness. */
import type { Humanoid } from "../character/humanoid.ts";
import type { Runner } from "./sim.ts";

type Pose = Record<"hipsY" | "spine" | "head" | "hipL" | "hipR" | "kneeL" | "kneeR" | "shL" | "shR" | "elL" | "elR" | "shLz" | "shRz" | "roll", number>;
const KEYS = ["hipsY", "spine", "head", "hipL", "hipR", "kneeL", "kneeR", "shL", "shR", "elL", "elR", "shLz", "shRz", "roll"] as const;

export class ParkourAnimator {
  private cur: Pose = { hipsY: 0.92, spine: 0, head: 0, hipL: 0, hipR: 0, kneeL: 0, kneeR: 0, shL: 0, shR: 0, elL: 0, elR: 0, shLz: -8, shRz: 8, roll: 0 };
  private t = 0;
  private flip = 0;

  constructor(private h: Humanoid) {}

  update(a: Runner, dt: number, celebrate: number, ready: boolean) {
    this.t += dt;
    const p = this.target(a, celebrate, ready);
    // Fast states snap harder so take-offs and landings read crisply.
    const rate = a.state === "air" || a.state === "slide" || a.state === "climb" ? 22 : a.state === "run" ? 30 : 10;
    const k = 1 - Math.exp(-dt * rate);
    for (const key of KEYS) this.cur[key] += (p[key] - this.cur[key]) * k;
    // Forward flip on big perfect jumps is handled by `roll`.
    const c = this.cur, h = this.h;
    h.hips.setLocalPosition(0, c.hipsY, 0);
    h.hips.setLocalEulerAngles(c.roll, 0, 0);
    h.spine.setLocalEulerAngles(c.spine, 0, 0);
    h.head.setLocalEulerAngles(c.head, 0, 0);
    h.hipL.setLocalEulerAngles(c.hipL, 0, -3);
    h.hipR.setLocalEulerAngles(c.hipR, 0, 3);
    h.kneeL.setLocalEulerAngles(c.kneeL, 0, 0);
    h.kneeR.setLocalEulerAngles(c.kneeR, 0, 0);
    h.shoulderL.setLocalEulerAngles(c.shL, 0, c.shLz);
    h.shoulderR.setLocalEulerAngles(c.shR, 0, c.shRz);
    h.elbowL.setLocalEulerAngles(c.elL, 0, 0);
    h.elbowR.setLocalEulerAngles(c.elR, 0, 0);
  }

  /** Spin into a forward flip (perfect move flourish). */
  trick() {
    this.flip = 1;
  }

  private target(a: Runner, celebrate: number, ready: boolean): Pose {
    const cyc = Math.sin(a.stride);
    const run = Math.min(1, a.vx / 9);
    if (this.flip > 0 && a.state === "air") {
      this.flip = Math.max(0, this.flip - 0.022);
    } else this.flip = 0;
    const roll = this.flip > 0 ? -(1 - this.flip) * 360 : 0;
    switch (a.state) {
      case "ready":
        if (ready) {
          // Crouched, ready to go.
          return { hipsY: 0.78, spine: -30, head: 20, hipL: 50, hipR: -10, kneeL: -70, kneeR: -40, shL: -20, shR: 40, elL: 60, elR: 70, shLz: -10, shRz: 10, roll: 0 };
        }
        return { hipsY: 0.92, spine: 0, head: 0, hipL: 0, hipR: 0, kneeL: -4, kneeR: -4, shL: 0, shR: 0, elL: 10, elR: 10, shLz: -8, shRz: 8, roll: 0 };
      case "run": {
        const amp = 30 + 45 * run;
        const arm = 25 + 50 * run;
        return {
          hipsY: 0.9 - run * 0.03 + Math.abs(Math.cos(a.stride)) * 0.05 * run,
          spine: -6 - run * 12, head: 8 + run * 6,
          hipL: cyc * amp + 10 * run, hipR: -cyc * amp + 10 * run,
          kneeL: -(18 + Math.max(0, -cyc) * (40 + 70 * run)), kneeR: -(18 + Math.max(0, cyc) * (40 + 70 * run)),
          shL: -cyc * arm, shR: cyc * arm, elL: 75 + run * 15, elR: 75 + run * 15, shLz: -8, shRz: 8, roll: 0,
        };
      }
      case "air": {
        // Rising: knees tucked, arms up; falling: legs reach for the landing.
        const rising = a.vy > 0;
        const k = Math.max(0, Math.min(1, (a.vy + 6) / 12));
        return {
          hipsY: 0.95, spine: rising ? -25 : -12, head: 15,
          hipL: 70 + k * 30, hipR: rising ? 40 + k * 40 : 60, kneeL: -(60 + k * 60), kneeR: rising ? -(90 + k * 30) : -30,
          shL: rising ? 140 : 70, shR: rising ? 120 : 60, elL: 20, elR: 25, shLz: -25, shRz: 25, roll,
        };
      }
      case "slide":
        // Baseball slide: lean back, lead leg out, trail leg tucked, one hand down.
        return { hipsY: 0.32, spine: 55, head: -35, hipL: 85, hipR: 50, kneeL: -8, kneeR: -95, shL: -40, shR: 60, elL: 10, elR: 40, shLz: -40, shRz: 20, roll: 0 };
      case "climb": {
        const pull = Math.sin(this.t * 14);
        return { hipsY: 0.85, spine: -20, head: 25, hipL: 70 + pull * 30, hipR: 40 - pull * 30, kneeL: -90, kneeR: -70, shL: 160 + pull * 15, shR: 160 - pull * 15, elL: 40, elR: 40, shLz: -10, shRz: 10, roll: 0 };
      }
      case "stumble": {
        const w = Math.sin(this.t * 18) * 15;
        return { hipsY: 0.8, spine: -35, head: 25, hipL: 50 + w, hipR: -20 - w, kneeL: -60, kneeR: -40, shL: 60 + w, shR: -40, elL: 30, elR: 30, shLz: -60, shRz: 60, roll: 0 };
      }
      case "fall": {
        const w = Math.sin(this.t * 20) * 50;
        return { hipsY: 0.92, spine: 10, head: -10, hipL: 30 + w * 0.5, hipR: -30 - w * 0.5, kneeL: -40, kneeR: -40, shL: 150 + w, shR: 150 - w, elL: 20, elR: 20, shLz: -50, shRz: 50, roll: 0 };
      }
      case "done": {
        if (a.vx > 1.5) return this.target({ ...a, state: "run" }, 0, false);
        if (celebrate > 0.6) {
          const b = Math.abs(Math.sin(this.t * 5));
          return { hipsY: 0.92 + b * 0.12, spine: 5, head: -15, hipL: 0, hipR: 0, kneeL: -b * 30, kneeR: -b * 30, shL: 170, shR: 170, elL: 10, elR: 10, shLz: -25, shRz: 25, roll: 0 };
        }
        if (celebrate < 0) return { hipsY: 0.88, spine: -30, head: 30, hipL: 10, hipR: 10, kneeL: -15, kneeR: -15, shL: 30, shR: 30, elL: 40, elR: 40, shLz: -5, shRz: 5, roll: 0 };
        // Hands on knees, catching breath.
        return { hipsY: 0.84, spine: -45, head: 30, hipL: 35, hipR: 35, kneeL: -30, kneeR: -30, shL: 55, shR: 55, elL: 15, elR: 15, shLz: -10, shRz: 10, roll: 0 };
      }
    }
  }
}
