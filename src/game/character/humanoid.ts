/**
 * Articulated 3D player character built from the player's AvatarConfig (character studio).
 * Shared by every sport. A small joint hierarchy (hips → spine → shoulders/elbows, hips → knees)
 * is posed procedurally each frame by the sport's animator.
 *
 * Local frame: character stands at the origin facing -Z, +Y up. Rotating a limb joint by a positive
 * X angle swings it forward (toward -Z).
 */
import * as pc from "playcanvas";
import type { AvatarConfig } from "@/lib/avatar";

export interface Joint {
  pivot: pc.Entity;
}

export interface Humanoid {
  root: pc.Entity;
  hips: pc.Entity;
  spine: pc.Entity;
  head: pc.Entity;
  shoulderL: pc.Entity;
  shoulderR: pc.Entity;
  elbowL: pc.Entity;
  elbowR: pc.Entity;
  handL: pc.Entity;
  handR: pc.Entity;
  hipL: pc.Entity;
  hipR: pc.Entity;
  kneeL: pc.Entity;
  kneeR: pc.Entity;
  /** Re-colour/re-style from a new avatar. */
  apply(config: AvatarConfig | null): void;
  /** Reset every joint to the neutral standing pose. */
  neutral(): void;
  destroy(): void;
}

const DEFAULT: AvatarConfig = {
  version: 1,
  nickname: "Player",
  genderPresentation: "neutral",
  skinTone: "#d39b72",
  face: "focused",
  hairstyle: "short",
  hairColor: "#1b1410",
  outfit: "jersey",
  outfitColor: "#2f7bff",
  shoes: "runner",
  shoeColor: "#ff7a1a",
  accessory: "none",
};

function color(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function material(hex: string, gloss = 0.35, sheen = false) {
  const m = new pc.StandardMaterial();
  m.useMetalness = true;
  m.metalness = 0;
  m.gloss = gloss;
  m.diffuse = color(hex);
  if (sheen) {
    m.clearCoat = 0.3;
    m.clearCoatGloss = 0.7;
  }
  m.update();
  return m;
}

function part(parent: pc.Entity, type: string, mat: pc.Material, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number], shadows = true) {
  const e = new pc.Entity();
  e.addComponent("render", { type, material: mat, castShadows: shadows, receiveShadows: true });
  e.setLocalPosition(...pos);
  // The built-in capsule is 2 units tall (others are 1), so halve its Y scale: scales here are real sizes in metres.
  e.setLocalScale(scale[0], type === "capsule" ? scale[1] / 2 : scale[1], scale[2]);
  if (rot) e.setLocalEulerAngles(...rot);
  parent.addChild(e);
  return e;
}

function pivot(parent: pc.Entity, name: string, pos: [number, number, number]) {
  const e = new pc.Entity(name);
  e.setLocalPosition(...pos);
  parent.addChild(e);
  return e;
}

export function createHumanoid(parent: pc.Entity, config: AvatarConfig | null, opts: { shadows?: boolean; detail?: "full" | "simple" } = {}): Humanoid {
  const shadows = opts.shadows ?? true;
  const root = new pc.Entity("humanoid");
  parent.addChild(root);

  // Skeleton (pivots only; meshes are rebuilt by apply()).
  const hips = pivot(root, "hips", [0, 0.95, 0]);
  const spine = pivot(hips, "spine", [0, 0.05, 0]);
  const head = pivot(spine, "head", [0, 0.56, 0]);
  const shoulderL = pivot(spine, "shoulderL", [-0.21, 0.47, 0]);
  const shoulderR = pivot(spine, "shoulderR", [0.21, 0.47, 0]);
  const elbowL = pivot(shoulderL, "elbowL", [0, -0.28, 0]);
  const elbowR = pivot(shoulderR, "elbowR", [0, -0.28, 0]);
  const handL = pivot(elbowL, "handL", [0, -0.27, 0]);
  const handR = pivot(elbowR, "handR", [0, -0.27, 0]);
  const hipL = pivot(hips, "hipL", [-0.095, -0.03, 0]);
  const hipR = pivot(hips, "hipR", [0.095, -0.03, 0]);
  const kneeL = pivot(hipL, "kneeL", [0, -0.44, 0]);
  const kneeR = pivot(hipR, "kneeR", [0, -0.44, 0]);

  let meshes: pc.Entity[] = [];
  let mats: pc.Material[] = [];

  const apply = (cfg: AvatarConfig | null) => {
    meshes.forEach((m) => m.destroy());
    mats.forEach((m) => m.destroy());
    meshes = [];
    mats = [];
    const c = cfg ?? DEFAULT;
    const skin = material(c.skinTone, 0.38);
    const shirt = material(c.outfitColor, 0.3, c.outfit === "track");
    const pants = material(c.outfit === "tennis" ? "#e8eaf0" : "#1d2333", 0.25);
    const shoe = material(c.shoeColor, 0.55, true);
    const hair = material(c.hairColor, 0.45);
    const dark = material("#111111", 0.6);
    const accent = material(c.outfit === "track" || c.outfit === "polo" ? "#ffffff" : c.shoeColor, 0.3);
    mats = [skin, shirt, pants, shoe, hair, dark, accent];
    const add = (p: pc.Entity, type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number]) => {
      const e = part(p, type, m, pos, scale, rot, shadows);
      meshes.push(e);
      return e;
    };

    const broad = c.genderPresentation === "masculine" ? 1.08 : c.genderPresentation === "feminine" ? 0.92 : 1;
    const hipW = c.genderPresentation === "feminine" ? 1.08 : 1;

    // Torso and pelvis.
    add(hips, "capsule", pants, [0, 0, 0], [0.3 * hipW, 0.26, 0.2]);
    add(spine, "capsule", shirt, [0, 0.25, 0], [0.4 * broad, 0.56, 0.24]);
    if (c.outfit === "jersey") {
      const white = material("#f2f2f2", 0.3);
      mats.push(white);
      add(spine, "box", white, [0, 0.36, -0.002], [0.41 * broad, 0.035, 0.25]); // chest stripe
      add(spine, "box", white, [0, 0.3, -0.002], [0.41 * broad, 0.015, 0.25]);
    }
    if (c.outfit === "polo") add(spine, "box", accent, [0, 0.46, -0.1], [0.12, 0.05, 0.02]);
    if (c.outfit === "track") {
      add(spine, "box", accent, [-0.12 * broad, 0.25, -0.1], [0.018, 0.48, 0.02]);
      add(spine, "box", accent, [0.12 * broad, 0.25, -0.1], [0.018, 0.48, 0.02]);
    }
    // Neck and head.
    add(spine, "cylinder", skin, [0, 0.51, 0], [0.09, 0.08, 0.09]);
    add(head, "sphere", skin, [0, 0.12, 0], [0.21, 0.24, 0.22]);
    add(head, "sphere", skin, [0, 0.11, -0.115], [0.035, 0.04, 0.03]); // nose
    add(head, "sphere", dark, [-0.04, 0.15, -0.098], [0.022, 0.026, 0.012]);
    add(head, "sphere", dark, [0.04, 0.15, -0.098], [0.022, 0.026, 0.012]);
    add(head, "box", dark, [0, 0.065, -0.103], [0.05, c.face === "smile" ? 0.012 : 0.008, 0.01]);
    add(head, "sphere", skin, [-0.108, 0.12, 0], [0.03, 0.05, 0.04]); // ears
    add(head, "sphere", skin, [0.108, 0.12, 0], [0.03, 0.05, 0.04]);
    // Hair.
    switch (c.hairstyle) {
      case "buzz":
        add(head, "sphere", hair, [0, 0.15, 0.01], [0.215, 0.2, 0.225]);
        break;
      case "short":
        add(head, "sphere", hair, [0, 0.17, 0.015], [0.225, 0.2, 0.235]);
        break;
      case "curly":
        for (const [x, y, z] of [[-0.07, 0.22, 0], [0.07, 0.22, 0], [0, 0.24, 0.04], [0, 0.22, -0.06], [-0.09, 0.18, 0.06], [0.09, 0.18, 0.06], [0, 0.2, 0.09]] as const)
          add(head, "sphere", hair, [x, y, z], [0.11, 0.1, 0.11]);
        break;
      case "long":
        add(head, "sphere", hair, [0, 0.17, 0.015], [0.23, 0.21, 0.24]);
        add(head, "capsule", hair, [0, 0.0, 0.07], [0.2, 0.32, 0.1]);
        break;
      case "ponytail":
        add(head, "sphere", hair, [0, 0.17, 0.015], [0.225, 0.2, 0.235]);
        add(head, "capsule", hair, [0, 0.07, 0.15], [0.06, 0.2, 0.06], [-25, 0, 0]);
        break;
      case "mohawk":
        add(head, "box", hair, [0, 0.25, 0.01], [0.03, 0.08, 0.2]);
        break;
    }
    if (c.accessory === "cap") {
      add(head, "sphere", shirt, [0, 0.19, 0.01], [0.235, 0.17, 0.245]);
      add(head, "box", shirt, [0, 0.2, -0.13], [0.16, 0.012, 0.1]);
    } else if (c.accessory === "headband") {
      add(head, "cylinder", shirt, [0, 0.19, 0], [0.225, 0.03, 0.235]);
    } else if (c.accessory === "glasses") {
      add(head, "box", dark, [0, 0.15, -0.105], [0.13, 0.035, 0.01]);
    }
    // Arms: short sleeves then skin.
    for (const [sh, el, hd] of [[shoulderL, elbowL, handL], [shoulderR, elbowR, handR]] as const) {
      add(sh, "sphere", shirt, [0, -0.02, 0], [0.12 * broad, 0.12, 0.12]);
      add(sh, "capsule", shirt, [0, -0.07, 0], [0.105, 0.14, 0.105]);
      add(sh, "capsule", skin, [0, -0.17, 0], [0.085, 0.24, 0.085]);
      add(el, "capsule", skin, [0, -0.13, 0], [0.075, 0.27, 0.075]);
      add(hd, "sphere", skin, [0, -0.03, 0], [0.075, 0.1, 0.06]);
      if (c.accessory === "wristbands") add(el, "cylinder", shirt, [0, -0.22, 0], [0.08, 0.04, 0.08]);
    }
    // Legs and shoes.
    for (const [hp, kn] of [[hipL, kneeL], [hipR, kneeR]] as const) {
      add(hp, "capsule", pants, [0, -0.22, 0], [0.135, 0.5, 0.135]);
      add(kn, "capsule", pants, [0, -0.21, 0], [0.11, 0.46, 0.11]);
      add(kn, "box", shoe, [0, -0.45, -0.04], [0.1, c.shoes === "high-top" ? 0.11 : 0.07, 0.26]);
      add(kn, "box", material("#f2f2f2", 0.3), [0, -0.48, -0.04], [0.102, 0.018, 0.262]); // sole
    }
  };

  const joints = [hips, spine, head, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hipL, hipR, kneeL, kneeR];
  const neutral = () => {
    joints.forEach((j) => j.setLocalEulerAngles(0, 0, 0));
    hips.setLocalPosition(0, 0.95, 0);
    shoulderL.setLocalEulerAngles(0, 0, -6);
    shoulderR.setLocalEulerAngles(0, 0, 6);
  };

  apply(config);
  neutral();

  return {
    root, hips, spine, head, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hipL, hipR, kneeL, kneeR,
    apply,
    neutral,
    destroy() {
      mats.forEach((m) => m.destroy());
      root.destroy();
    },
  };
}

/** Smooth keyframe interpolation: keys are [time, value]; clamps outside the range. */
export function keyframes(keys: ReadonlyArray<readonly [number, number]>, t: number): number {
  if (t <= keys[0]![0]) return keys[0]![1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    if (t <= t1) {
      const [t0, v0] = keys[i - 1]!;
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return v0 + (v1 - v0) * s;
    }
  }
  return keys[keys.length - 1]![1];
}
