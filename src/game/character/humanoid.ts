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
import { addSurfaceDetail } from "../shared/surface.ts";

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

/** Skin: soft specular with a faint sheen (sweat/oil), slightly warm subsurface tint in the ambient. */
function skinMaterial(hex: string) {
  const m = material(hex, 0.42);
  m.clearCoat = 0.12;
  m.clearCoatGloss = 0.55;
  const c = color(hex);
  m.emissive = new pc.Color(c.r * 0.025, c.g * 0.01, c.b * 0.008); // cheap subsurface glow
  m.update();
  return m;
}

/** Sports fabric: matte with a fine weave normal map. */
function fabricMaterial(hex: string, device: pc.GraphicsDevice | null, gloss = 0.3) {
  const m = material(hex, gloss);
  if (device) {
    try {
      addSurfaceDetail(m, device, "fabric", [6, 6], "high", 0.6);
    } catch {
      /* detail is optional */
    }
  }
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


// ---------------------------------------------------------------------------------------------
// Sculpted body meshes: surfaces of revolution with elliptical cross-sections (muscle contours,
// tapered limbs, shaped torso and skull) instead of primitive capsules. Cached per device.
type Profile = ReadonlyArray<readonly [number, number]>; // [radius, y]

const meshCache = new Map<string, pc.Mesh>();

function lathe(device: pc.GraphicsDevice, key: string, profile: Profile, depth = 1, segs = 20): pc.Mesh {
  const k = `${key}:${depth}:${segs}`;
  const hit = meshCache.get(k);
  if (hit && (hit as unknown as { device?: pc.GraphicsDevice }).device === device) return hit;
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const rows = profile.length;
  // Profiles may run upward or downward; orient normals and winding outward either way.
  const up = profile[rows - 1]![1] > profile[0]![1] ? 1 : -1;
  for (let i = 0; i < rows; i++) {
    const [r, y] = profile[i]!;
    // Profile slope for normals.
    const a = profile[Math.max(0, i - 1)]!, b = profile[Math.min(rows - 1, i + 1)]!;
    const dr = b[0] - a[0], dy = b[1] - a[1];
    const ny = -dr * up, nr = dy * up; // outward perpendicular to (dr, dy)
    for (let j = 0; j <= segs; j++) {
      const t = (j / segs) * Math.PI * 2;
      const cx = Math.cos(t), sz = Math.sin(t);
      pos.push(cx * r, y, sz * r * depth);
      const nx = cx * nr, nz = (sz * nr) / Math.max(0.2, depth);
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      uv.push(j / segs, i / (rows - 1));
    }
  }
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * (segs + 1) + j, b = a + segs + 1;
      if (up > 0) idx.push(a, b, a + 1, a + 1, b, b + 1);
      else idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos);
  mesh.setNormals(nor);
  mesh.setUvs(0, uv);
  mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  meshCache.set(k, mesh);
  return mesh;
}

/** A limb segment hanging down from its joint (y = 0 to −len) with a muscle bulge. */
function limbProfile(r0: number, r1: number, len: number, bulge: number, bulgeAt = 0.35): Profile {
  const pts: [number, number][] = [[0, 0.02]];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const base = r0 + (r1 - r0) * t;
    const m = bulge * Math.exp(-(((t - bulgeAt) / 0.22) ** 2));
    const cap = Math.sin(Math.min(1, Math.min(t, 1 - t) * 6 + 0.25) * Math.PI / 2);
    pts.push([(base + m) * cap, -len * t]);
  }
  pts.push([0, -len - 0.015]);
  return pts;
}

function meshPart(parent: pc.Entity, mesh: pc.Mesh, mat: pc.Material, pos: [number, number, number], shadows: boolean, scale: [number, number, number] = [1, 1, 1], rot?: [number, number, number]) {
  const e = new pc.Entity();
  e.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, mat)], castShadows: shadows, receiveShadows: true });
  e.setLocalPosition(...pos);
  e.setLocalScale(...scale);
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
    const device = (pc.AppBase.getApplication() ?? null)?.graphicsDevice ?? null;
    const fem = c.genderPresentation === "feminine";
    const masc = c.genderPresentation === "masculine";
    const skin = skinMaterial(c.skinTone);
    const shirt = fabricMaterial(c.outfitColor, device, c.outfit === "track" ? 0.5 : 0.28);
    const shortsColor = c.outfit === "tennis" ? "#f4f5f8" : c.outfit === "polo" ? "#2a2f3d" : c.outfit === "track" ? "#14171f" : "#1d2333";
    const pants = fabricMaterial(shortsColor, device, 0.25);
    const shoe = material(c.shoeColor, 0.55, true);
    const sole = material("#f2f2f2", 0.35);
    const hair = material(c.hairColor, 0.5);
    hair.clearCoat = 0.35;
    hair.clearCoatGloss = 0.6;
    hair.update();
    const dark = material("#111111", 0.6);
    const white = material("#f7f7f2", 0.7);
    const iris = material(["#3b2a1a", "#2c4a6b", "#3d5a2e"][c.nickname.length % 3]!, 0.9);
    const lips = material("#9b5b52", 0.55);
    const accent = material(c.outfit === "track" || c.outfit === "polo" ? "#ffffff" : c.shoeColor, 0.3);
    mats = [skin, shirt, pants, shoe, sole, hair, dark, white, iris, lips, accent];
    const add = (p: pc.Entity, type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], rot?: [number, number, number]) => {
      const e = part(p, type, m, pos, scale, rot, shadows);
      meshes.push(e);
      return e;
    };
    const sculpt = (p: pc.Entity, key: string, prof: Profile, m: pc.Material, pos: [number, number, number], depth = 1, scale: [number, number, number] = [1, 1, 1], rot?: [number, number, number]) => {
      if (!device) return add(p, "capsule", m, pos, [0.12, 0.3, 0.12]);
      const e = meshPart(p, lathe(device, key, prof, depth), m, pos, shadows, scale, rot);
      meshes.push(e);
      return e;
    };

    const broad = masc ? 1.08 : fem ? 0.9 : 1;
    const hipW = fem ? 1.1 : 1;
    const bust = fem ? 1.08 : 1;

    // Pelvis / shorts and torso / shirt (shaped: waist, chest, shoulder slope).
    sculpt(hips, `pelvis${hipW}`, [[0, 0.08], [0.13 * hipW, 0.07], [0.165 * hipW, 0.02], [0.17 * hipW, -0.06], [0.15 * hipW, -0.12], [0, -0.14]], pants, [0, 0, 0], 0.68);
    const torso: Profile = [[0, -0.02], [0.16 * hipW, -0.01], [0.15, 0.08], [0.138, 0.16], [0.155 * bust, 0.27], [0.178 * broad, 0.36], [0.19 * broad, 0.42], [0.165 * broad, 0.47], [0.11, 0.51], [0.06, 0.53], [0, 0.535]];
    sculpt(spine, `torso${broad}${bust}${hipW}`, torso, shirt, [0, 0, 0], 0.62);
    if (c.outfit === "jersey") {
      add(spine, "box", white, [0, 0.36, -0.105], [0.3 * broad, 0.03, 0.01]); // chest stripes
      add(spine, "box", white, [0, 0.31, -0.1], [0.28 * broad, 0.012, 0.01]);
    }
    if (c.outfit === "polo") {
      add(spine, "box", accent, [0, 0.49, -0.07], [0.14, 0.04, 0.02], [20, 0, 0]); // collar
      add(spine, "box", white, [0, 0.43, -0.1], [0.012, 0.08, 0.008]); // placket
    }
    if (c.outfit === "track") {
      add(spine, "box", accent, [-0.12 * broad, 0.25, -0.093], [0.018, 0.42, 0.01]);
      add(spine, "box", accent, [0.12 * broad, 0.25, -0.093], [0.018, 0.42, 0.01]);
    }
    // Neck (sternocleidomastoid taper) and head (skull + jaw).
    sculpt(spine, "neck", [[0, 0.47], [0.055, 0.48], [0.05, 0.53], [0.047, 0.58], [0.05, 0.61], [0, 0.62]], skin, [0, 0, 0.005], 0.95);
    const skull: Profile = [[0, -0.02], [0.035, -0.015], [0.06, 0.0], [0.075, 0.03], [0.088, 0.07], [0.098, 0.12], [0.102, 0.16], [0.098, 0.2], [0.085, 0.24], [0.06, 0.27], [0.03, 0.285], [0, 0.29]];
    sculpt(head, `skull${fem ? "f" : "m"}`, skull, skin, [0, -0.02, 0.01], fem ? 1.12 : 1.18, [fem ? 0.95 : 1, 1, 1]);
    // Face: brow, nose, eyes (sclera + iris), lips, ears.
    add(head, "sphere", skin, [0, 0.165, -0.095], [0.16, 0.035, 0.05]); // brow ridge
    add(head, "box", hair, [-0.042, 0.182, -0.104], [0.045, 0.009, 0.01], [0, 0, c.face === "fierce" ? -12 : 4]); // eyebrows
    add(head, "box", hair, [0.042, 0.182, -0.104], [0.045, 0.009, 0.01], [0, 0, c.face === "fierce" ? 12 : -4]);
    add(head, "sphere", skin, [0, 0.11, -0.118], [0.032, 0.06, 0.04], [-15, 0, 0]); // nose bridge
    add(head, "sphere", skin, [0, 0.085, -0.127], [0.04, 0.028, 0.03]); // nose tip
    for (const sx of [-1, 1]) {
      add(head, "sphere", white, [sx * 0.04, 0.148, -0.094], [0.032, 0.02, 0.016]);
      add(head, "sphere", iris, [sx * 0.04, 0.148, -0.102], [0.016, 0.017, 0.008]);
      add(head, "sphere", dark, [sx * 0.04, 0.148, -0.106], [0.007, 0.007, 0.003]);
      add(head, "sphere", skin, [sx * 0.104, 0.12, 0.01], [0.022, 0.055, 0.035]); // ears
      add(head, "sphere", skin, [sx * 0.06, 0.09, -0.08], [0.05, 0.05, 0.045]); // cheekbones
    }
    add(head, "sphere", lips, [0, 0.045, -0.106], [0.05, c.face === "smile" ? 0.02 : 0.016, 0.02]);
    add(head, "sphere", skin, [0, 0.005, -0.08], [0.07, 0.05, 0.05]); // chin
    // Hair (fuller shapes hugging the skull).
    switch (c.hairstyle) {
      case "buzz":
        add(head, "sphere", hair, [0, 0.165, 0.018], [0.206, 0.2, 0.232]);
        break;
      case "short":
        add(head, "sphere", hair, [0, 0.18, 0.02], [0.218, 0.2, 0.24]);
        add(head, "sphere", hair, [0, 0.215, -0.07], [0.16, 0.06, 0.08], [10, 0, 0]); // fringe volume
        break;
      case "curly":
        for (const [x, y, z] of [[-0.07, 0.22, 0], [0.07, 0.22, 0], [0, 0.25, 0.03], [0, 0.23, -0.06], [-0.095, 0.17, 0.05], [0.095, 0.17, 0.05], [0, 0.19, 0.1], [-0.05, 0.24, 0.07], [0.05, 0.24, 0.07]] as const)
          add(head, "sphere", hair, [x, y, z], [0.1, 0.09, 0.1]);
        break;
      case "long":
        add(head, "sphere", hair, [0, 0.18, 0.02], [0.222, 0.205, 0.245]);
        sculpt(head, "longhair", [[0.0, 0.2], [0.1, 0.17], [0.115, 0.06], [0.12, -0.08], [0.11, -0.16], [0, -0.17]], hair, [0, 0.0, 0.035], 0.75);
        break;
      case "ponytail":
        add(head, "sphere", hair, [0, 0.18, 0.02], [0.218, 0.2, 0.24]);
        add(head, "sphere", hair, [0, 0.16, 0.12], [0.05, 0.05, 0.05]);
        add(head, "capsule", hair, [0, 0.06, 0.155], [0.06, 0.22, 0.055], [-22, 0, 0]);
        break;
      case "mohawk":
        add(head, "sphere", hair, [0, 0.165, 0.02], [0.2, 0.19, 0.228]); // shaved sides
        add(head, "box", hair, [0, 0.26, 0.02], [0.035, 0.07, 0.2]);
        break;
    }
    if (c.accessory === "cap") {
      add(head, "sphere", shirt, [0, 0.2, 0.015], [0.23, 0.16, 0.25]);
      add(head, "box", shirt, [0, 0.205, -0.14], [0.17, 0.012, 0.11], [-6, 0, 0]);
    } else if (c.accessory === "headband") {
      add(head, "cylinder", shirt, [0, 0.2, 0.012], [0.218, 0.032, 0.245]);
    } else if (c.accessory === "glasses") {
      add(head, "box", dark, [-0.042, 0.148, -0.113], [0.06, 0.035, 0.004]);
      add(head, "box", dark, [0.042, 0.148, -0.113], [0.06, 0.035, 0.004]);
      add(head, "box", dark, [0, 0.155, -0.113], [0.03, 0.006, 0.004]);
    }
    // Arms: deltoid, sleeve, biceps/triceps, forearm, wrist, hand with fingers and thumb.
    const armR = fem ? 0.9 : masc ? 1.08 : 1;
    for (const [side, sh, el, hd] of [[-1, shoulderL, elbowL, handL], [1, shoulderR, elbowR, handR]] as const) {
      add(sh, "sphere", shirt, [0, -0.015, 0], [0.13 * broad, 0.12, 0.12]); // shoulder cap
      sculpt(sh, `sleeve${armR}`, limbProfile(0.062 * armR, 0.056 * armR, 0.14, 0.004), shirt, [0, -0.005, 0], 1.05);
      sculpt(sh, `upperarm${armR}`, limbProfile(0.05 * armR, 0.04 * armR, 0.29, 0.012 * armR, 0.45), skin, [0, 0, 0], 0.95);
      sculpt(el, `forearm${armR}`, limbProfile(0.043 * armR, 0.027 * armR, 0.27, 0.01 * armR, 0.22), skin, [0, 0, 0], 0.85);
      add(hd, "sphere", skin, [0, -0.045, 0], [0.07, 0.085, 0.032]); // palm
      add(hd, "capsule", skin, [0, -0.115, 0], [0.068, 0.08, 0.026], [6, 0, 0]); // fingers (grouped, slight curl)
      add(hd, "capsule", skin, [side * -0.035, -0.055, -0.02], [0.022, 0.07, 0.022], [25, 0, side * 30]); // thumb
      if (c.accessory === "wristbands") add(el, "cylinder", shirt, [0, -0.25, 0], [0.068, 0.045, 0.06]);
    }
    // Legs: shorts/trousers over sculpted thigh, calf muscle, ankle; shoes with toe box and sole.
    const shortLegs = c.outfit === "tennis" || c.outfit === "jersey";
    for (const [hp, kn] of [[hipL, kneeL], [hipR, kneeR]] as const) {
      sculpt(hp, `thigh${hipW}`, limbProfile(0.085 * hipW, 0.055, 0.45, 0.012, 0.3), shortLegs ? skin : pants, [0, 0, 0], 0.95);
      if (shortLegs) sculpt(hp, `shortleg${hipW}`, limbProfile(0.093 * hipW, 0.085, 0.22, 0), pants, [0, 0.02, 0], 1);
      sculpt(kn, "calf", limbProfile(0.052, 0.032, 0.44, 0.016, 0.28), shortLegs ? skin : pants, [0, 0.01, 0.006], 0.9);
      if (shortLegs) add(kn, "cylinder", white, [0, -0.36, 0], [0.072, 0.1, 0.072]); // sports socks
      add(kn, "box", shoe, [0, -0.455, -0.035], [0.095, c.shoes === "high-top" ? 0.11 : 0.07, 0.24]);
      add(kn, "sphere", shoe, [0, -0.46, -0.15], [0.095, 0.07, 0.08]); // toe box
      add(kn, "box", sole, [0, -0.485, -0.045], [0.1, 0.022, 0.27]);
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
