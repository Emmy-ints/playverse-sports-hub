/** Golf swing animation for the shared humanoid, with a club held in the hands. */
import * as pc from "playcanvas";
import { keyframes, type Humanoid } from "../character/humanoid.ts";
import type { ClubId } from "./sim.ts";

export const IMPACT_T = 1.15;
const END_T = 2.0;

export class GolferAnimator {
  private t = 0;
  private mode: "address" | "swing" | "finish" | "react" = "address";
  private club: ClubId = "driver";
  private power = 1;
  private reactT = 0;
  private happy = false;
  private impacted = false;
  onImpact: (() => void) | null = null;
  private clubEntity: pc.Entity;
  private shaft: pc.Entity;
  private head: pc.Entity;

  constructor(private h: Humanoid, private mats: { shaft: pc.Material; head: pc.Material; grip: pc.Material }) {
    this.clubEntity = new pc.Entity("club");
    h.handR.addChild(this.clubEntity);
    this.shaft = new pc.Entity();
    this.shaft.addComponent("render", { type: "cylinder", material: mats.shaft, castShadows: true });
    this.clubEntity.addChild(this.shaft);
    const grip = new pc.Entity();
    grip.addComponent("render", { type: "cylinder", material: mats.grip, castShadows: true });
    grip.setLocalScale(0.026, 0.25, 0.026);
    grip.setLocalPosition(0, -0.06, 0);
    this.clubEntity.addChild(grip);
    this.head = new pc.Entity();
    this.head.addComponent("render", { type: "box", material: mats.head, castShadows: true });
    this.clubEntity.addChild(this.head);
    this.setClub("driver");
  }

  setClub(club: ClubId) {
    this.club = club;
    const len = club === "driver" ? 1.1 : club === "wood3" ? 1.05 : club === "putter" ? 0.86 : 0.95;
    this.shaft.setLocalScale(0.012, len, 0.012);
    this.shaft.setLocalPosition(0, -len / 2, 0);
    const wood = club === "driver" || club === "wood3";
    this.head.setLocalScale(club === "putter" ? 0.11 : wood ? 0.11 : 0.075, club === "putter" ? 0.025 : wood ? 0.06 : 0.05, club === "putter" ? 0.03 : wood ? 0.1 : 0.02);
    this.head.setLocalPosition(0, -len, -0.03);
  }

  /** Stand at address: golfer root is positioned/rotated by the renderer. */
  address() {
    this.mode = "address";
    this.t = 0;
    this.impacted = false;
    this.pose(0);
  }

  swing(power: number) {
    this.power = Math.max(0.05, Math.min(1, power));
    this.mode = "swing";
    this.t = 0;
    this.impacted = false;
  }

  react(happy: boolean) {
    this.mode = "react";
    this.happy = happy;
    this.reactT = 0;
  }

  update(dt: number) {
    if (this.mode === "swing") {
      this.t += dt;
      this.pose(this.t);
      if (!this.impacted && this.t >= IMPACT_T) {
        this.impacted = true;
        this.onImpact?.();
      }
      if (this.t >= END_T) this.mode = "finish";
    } else if (this.mode === "finish") {
      this.pose(END_T);
    } else if (this.mode === "react") {
      this.reactT += dt;
      this.reactPose(this.reactT);
    } else {
      this.t += dt;
      this.pose(0, Math.sin(this.t * 1.8) * 1.5);
    }
  }

  private pose(t: number, waggle = 0) {
    const h = this.h;
    const putt = this.club === "putter";
    // Swing arc (degrees about the golfer's Z axis: + = back to the right, − = through to the left).
    const top = putt ? 18 + 30 * this.power : 60 + 85 * this.power;
    const finish = putt ? -(14 + 26 * this.power) : -(70 + 80 * this.power);
    const arc = keyframes([[0, waggle], [0.25, top * 0.35], [0.85, top], [0.95, top], [IMPACT_T, 0], [IMPACT_T + 0.35, finish], [END_T, finish]], t);
    const turn = putt ? 0 : keyframes([[0, 0], [0.85, 80 * this.power], [IMPACT_T, 10], [IMPACT_T + 0.35, -85], [END_T, -90]], t);
    const lean = putt ? 38 : 30;

    h.hips.setLocalPosition(0, putt ? 0.88 : 0.9, 0);
    h.spine.setLocalEulerAngles(lean * (putt ? 1 : t > IMPACT_T + 0.3 ? 0.4 : 1), turn * 0.6, 0);
    h.head.setLocalEulerAngles(putt ? 15 : 10, -turn * 0.35, 0);
    h.hipL.setLocalEulerAngles(-8, 0, -3);
    h.hipR.setLocalEulerAngles(-8, 0, 3);
    h.kneeL.setLocalEulerAngles(16, 0, 0);
    h.kneeR.setLocalEulerAngles(16, 0, 0);
    // Arms hang toward the ball and come together at the grip; both swing through the same arc.
    const fwd = putt ? 32 : 26;
    h.shoulderL.setLocalEulerAngles(fwd, 0, 16 + arc);
    h.shoulderR.setLocalEulerAngles(fwd, 0, -16 + arc);
    const hinge = putt ? 0 : keyframes([[0, 0], [0.85, 70 * this.power], [IMPACT_T, 0], [IMPACT_T + 0.35, 0], [END_T, 60]], t);
    h.elbowL.setLocalEulerAngles(4, 0, 0);
    h.elbowR.setLocalEulerAngles(4 + hinge * 0.4, 0, 0);
    // Club points out of the hands toward the ball.
    this.clubEntity.setLocalEulerAngles(putt ? 8 : 20 + hinge, 0, 0);
  }

  private reactPose(t: number) {
    const h = this.h;
    const e = Math.min(1, t / 0.4);
    h.spine.setLocalEulerAngles(0, 0, 0);
    h.hips.setLocalPosition(0, 0.95, 0);
    h.kneeL.setLocalEulerAngles(0, 0, 0);
    h.kneeR.setLocalEulerAngles(0, 0, 0);
    h.hipL.setLocalEulerAngles(0, 0, 0);
    h.hipR.setLocalEulerAngles(0, 0, 0);
    if (this.happy) {
      const pump = Math.sin(t * 9) * 18 * Math.max(0, 1 - t / 1.5);
      h.shoulderR.setLocalEulerAngles(150 * e + pump, 0, 20);
      h.elbowR.setLocalEulerAngles(30, 0, 0);
      h.shoulderL.setLocalEulerAngles(150 * e - pump, 0, -20);
      h.elbowL.setLocalEulerAngles(30, 0, 0);
      h.head.setLocalEulerAngles(-10, 0, 0);
    } else {
      h.shoulderR.setLocalEulerAngles(10, 0, 8);
      h.shoulderL.setLocalEulerAngles(120 * e, 0, -30);
      h.elbowL.setLocalEulerAngles(120 * e, 0, 0);
      h.head.setLocalEulerAngles(20 * e, Math.sin(t * 6) * 12 * Math.max(0, 1 - t / 1.5), 0);
    }
    this.clubEntity.setLocalEulerAngles(0, 0, 0);
  }
}
