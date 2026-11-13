/**
 * Realistic athletes: skinned human models (built from MakeHuman CC0 data) animated with motion
 * capture (CMU Graphics Lab, free for any use), retargeted offline — see scripts/athlete/.
 *
 * Shared by every sport. Each athlete is dressed from the player's AvatarConfig (skin tone, hair
 * style and colour, kit and shoe colours, accessory). A small animation mixer blends clips per bone
 * every frame, so sports can layer locomotion, strokes and celebrations freely.
 *
 * Local frame matches the old humanoid: the athlete stands at the origin facing −Z, +Y up.
 */
import * as pc from "playcanvas";
import type { AvatarConfig } from "@/lib/avatar";

const VERSION = 3;
const BASE = "/assets/athletes";

export type ClipName = "idle" | "run" | "walk" | "fh" | "bh" | "serve" | "cheer" | "sad";

export interface Clip {
  name: string;
  frames: number;
  fps: number;
  loop: boolean;
  duration: number;
  /** Seconds from clip start to the moment of contact (strokes only). */
  contact: number;
  rot: Float32Array; // frames × bones × 4
  root: Float32Array; // frames × 3
}

export interface AthleteAssets {
  containers: { m: pc.ContainerResource; f: pc.ContainerResource };
  bones: string[];
  clips: Record<string, Clip>;
  rig: {
    hand: Record<"L" | "R", { dir: number[]; across: number[]; normal: number[] }>;
    height: number;
    rootY: { m: number; f: number };
  };
}

const cache = new WeakMap<pc.AppBase, Promise<AthleteAssets>>();

function loadContainer(app: pc.AppBase, key: string): Promise<pc.ContainerResource> {
  return new Promise((resolve, reject) => {
    const asset = new pc.Asset(`athlete-${key}`, "container", { url: `${BASE}/athlete-${key}.glb?v=${VERSION}` });
    app.assets.add(asset);
    asset.once("load", () => resolve(asset.resource as pc.ContainerResource));
    asset.once("error", (e: unknown) => reject(e instanceof Error ? e : new Error(String(e))));
    app.assets.load(asset);
  });
}

function b64(s: string): ArrayBuffer {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

interface AnimJson {
  fps: number;
  bones: string[];
  clips: Record<string, { frames: number; loop: boolean; contact?: number; rot: string; root: string }>;
  rig: AthleteAssets["rig"];
}

/** Loads (once per app) both athlete models and the animation pack. */
export function loadAthleteAssets(app: pc.AppBase): Promise<AthleteAssets> {
  let p = cache.get(app);
  if (!p) {
    p = (async () => {
      const [m, f, json] = await Promise.all([
        loadContainer(app, "m"),
        loadContainer(app, "f"),
        fetch(`${BASE}/athlete-anims.json?v=${VERSION}`).then((r) => {
          if (!r.ok) throw new Error(`anims ${r.status}`);
          return r.json() as Promise<AnimJson>;
        }),
      ]);
      const clips: Record<string, Clip> = {};
      for (const [name, c] of Object.entries(json.clips)) {
        const q = new Int16Array(b64(c.rot));
        const rot = new Float32Array(q.length);
        for (let i = 0; i < q.length; i++) rot[i] = q[i]! / 32767;
        clips[name] = { name, frames: c.frames, fps: json.fps, loop: c.loop, duration: c.frames / json.fps, contact: c.contact ?? 0, rot, root: new Float32Array(b64(c.root)) };
      }
      return { containers: { m, f }, bones: json.bones, clips, rig: json.rig };
    })();
    cache.set(app, p);
  }
  return p;
}

export interface Layer {
  clip: Clip;
  time: number;
  weight: number;
}

const HAIR = ["buzz", "short", "curly", "mohawk", "long", "ponytail"] as const;

function color(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function hashStr(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function athleteBody(cfg: AvatarConfig | null): "m" | "f" {
  if (!cfg) return "m";
  if (cfg.genderPresentation === "masculine") return "m";
  if (cfg.genderPresentation === "feminine") return "f";
  return hashStr(cfg.nickname) % 2 ? "f" : "m";
}

/**
 * One athlete instance. `root` is positioned/rotated by the sport; the model inside faces −Z.
 */
export class Athlete {
  readonly root: pc.Entity;
  readonly body: "m" | "f";
  readonly model: pc.Entity;
  private boneEnts: (pc.Entity | null)[] = [];
  private rootBone: pc.Entity | null = null;
  private byName = new Map<string, pc.Entity>();
  private mats: Record<string, pc.StandardMaterial> = {};
  private acc: Float32Array;
  private accRoot = new Float32Array(3);
  private quat = new pc.Quat();
  private rootScale: number;
  private fingerRot = new Map<string, pc.Quat>();

  constructor(
    private assets: AthleteAssets,
    parent: pc.Entity,
    config: AvatarConfig | null,
    opts: { shadows?: boolean } = {},
  ) {
    this.body = athleteBody(config);
    this.root = new pc.Entity("athlete");
    parent.addChild(this.root);
    const container = assets.containers[this.body];
    this.model = container.instantiateRenderEntity({ castShadows: opts.shadows ?? true, receiveShadows: true });
    this.model.setLocalEulerAngles(0, 180, 0); // model faces +Z; athletes face −Z
    this.root.addChild(this.model);
    const walk = (e: pc.GraphNode) => {
      if (e instanceof pc.Entity && !this.byName.has(e.name)) this.byName.set(e.name, e);
      e.children.forEach(walk);
    };
    walk(this.model);
    this.boneEnts = assets.bones.map((n) => this.byName.get(n) ?? null);
    this.rootBone = this.byName.get("root") ?? null;
    this.acc = new Float32Array(assets.bones.length * 4);
    this.rootScale = assets.rig.rootY[this.body] / assets.rig.rootY.m;
    this.setupMaterials(container);
    this.apply(config);
    this.relaxedHands();
  }

  bone(name: string): pc.Entity | null {
    return this.byName.get(name) ?? null;
  }

  private setupMaterials(container: pc.ContainerResource) {
    void container;
    const mk = (gloss: number, opts: Partial<pc.StandardMaterial> = {}) => {
      const m = new pc.StandardMaterial();
      m.useMetalness = true;
      m.metalness = 0;
      m.gloss = gloss;
      Object.assign(m, opts);
      m.update();
      return m;
    };
    const renders = this.model.findComponents("render") as pc.RenderComponent[];
    const orig: Record<string, pc.StandardMaterial> = {};
    for (const r of renders) for (const mi of r.meshInstances) orig[mi.material.name] = mi.material as pc.StandardMaterial;
    this.mats = {
      skin: mk(0.38, { diffuseVertexColor: true, diffuseVertexColorChannel: "rgb" }),
      eyes: mk(0.9, { diffuseMap: orig["eyes"]?.diffuseMap ?? null }),
      kit_top: mk(0.22, { cull: pc.CULLFACE_NONE, twoSidedLighting: true, sheen: new pc.Color(0.25, 0.25, 0.25), sheenGloss: 0.3 }),
      kit_bottom: mk(0.2, { cull: pc.CULLFACE_NONE, twoSidedLighting: true, sheen: new pc.Color(0.2, 0.2, 0.2), sheenGloss: 0.3 }),
      socks: mk(0.1, { cull: pc.CULLFACE_NONE, diffuse: new pc.Color(0.95, 0.95, 0.95) }),
      shoe: mk(0.55, { clearCoat: 0.25, clearCoatGloss: 0.7 }),
      sole: mk(0.35, { diffuse: new pc.Color(0.94, 0.94, 0.92) }),
      hair: mk(0.5, { cull: pc.CULLFACE_NONE, twoSidedLighting: true, sheen: new pc.Color(0.3, 0.28, 0.25), sheenGloss: 0.55 }),
      accessory: mk(0.15, { cull: pc.CULLFACE_NONE }),
    };
    for (const r of renders)
      for (const mi of r.meshInstances) {
        const m = this.mats[mi.material.name];
        if (m) mi.material = m;
      }
  }

  apply(cfg: AvatarConfig | null) {
    const c = cfg ?? { skinTone: "#d39b72", hairstyle: "short", hairColor: "#1b1410", outfitColor: "#2f7bff", shoeColor: "#ff7a1a", accessory: "none", outfit: "tennis" };
    const set = (name: string, hex: string) => {
      const m = this.mats[name];
      if (!m) return;
      m.diffuse = color(hex);
      m.update();
    };
    set("skin", c.skinTone);
    // the vertex detail colours already carry shading; pull the tone down a touch so it reads true under the sun
    const sk = this.mats["skin"];
    if (sk) {
      const d = sk.diffuse;
      sk.diffuse = new pc.Color(d.r * 0.9, d.g * 0.9, d.b * 0.9);
      sk.update();
    }
    set("hair", c.hairColor);
    set("kit_top", c.outfitColor);
    // Shorts: white with a light kit, otherwise dark navy for contrast.
    set("kit_bottom", ["#e8eaf0", "#f2c230"].includes(c.outfitColor) ? "#1d2333" : "#f2f3f5");
    set("shoe", c.shoeColor);
    set("accessory", c.outfitColor === "#e8eaf0" ? "#1d2333" : "#f4f4f4");
    for (const h of HAIR) {
      const e = this.byName.get(`Hair_${h}`);
      if (e) e.enabled = h === c.hairstyle && c.accessory !== "cap";
    }
    const capHair = this.byName.get("Hair_buzz");
    if (c.accessory === "cap" && capHair) capHair.enabled = true;
    for (const a of ["headband", "wristbands", "cap"]) {
      const e = this.byName.get(`Acc_${a}`);
      if (e) e.enabled = c.accessory === a;
    }
  }

  /** Recolour one material slot (skin, hair, kit_top, kit_bottom, socks, shoe, sole, accessory). */
  setColor(slot: string, hex: string) {
    const m = this.mats[slot];
    if (!m) return;
    m.diffuse = color(hex);
    m.update();
  }

  /** Curl the fingers (0 = open, 1 = fist) of one hand; persists until changed. */
  setGrip(side: "L" | "R", amount: number, thumb = amount) {
    const h = this.assets.rig.hand[side];
    const across = new pc.Vec3(h.across[0], h.across[1], h.across[2]);
    const dir = new pc.Vec3(h.dir[0], h.dir[1], h.dir[2]);
    for (let f = 1; f <= 5; f++)
      for (let j = 1; j <= 3; j++) {
        const name = `finger${f}-${j}.${side}`;
        const q = new pc.Quat();
        if (f === 1) q.setFromAxisAngle(dir, (side === "R" ? 1 : -1) * thumb * (j === 1 ? 20 : 30));
        else q.setFromAxisAngle(across, (side === "R" ? 1 : -1) * amount * (j === 1 ? 63 : j === 2 ? 80 : 50));
        this.fingerRot.set(name, q);
        this.byName.get(name)?.setLocalRotation(q);
      }
  }

  relaxedHands() {
    this.setGrip("L", 0.35, 0.2);
    this.setGrip("R", 0.35, 0.2);
  }

  /** Put every mesh of this athlete on the given render layers (e.g. an offscreen bake layer). */
  setLayers(ids: number[]) {
    for (const r of this.model.findComponents("render") as pc.RenderComponent[]) r.layers = ids;
  }

  /** Blend the given layers (weights need not sum to 1) and pose the skeleton. `only` limits which bones are written. */
  pose(layers: Layer[], only?: (bone: string) => boolean) {
    const B = this.assets.bones.length;
    const acc = this.acc;
    acc.fill(0);
    this.accRoot.fill(0);
    let total = 0;
    for (const L of layers) {
      if (L.weight <= 0.0001) continue;
      total += L.weight;
      const c = L.clip;
      let ft = L.time * c.fps;
      if (c.loop) ft = ((ft % c.frames) + c.frames) % c.frames;
      else ft = Math.max(0, Math.min(c.frames - 1, ft));
      const f0 = Math.floor(ft);
      const f1 = c.loop ? (f0 + 1) % c.frames : Math.min(c.frames - 1, f0 + 1);
      const t = ft - f0;
      const o0 = f0 * B * 4, o1 = f1 * B * 4;
      for (let b = 0; b < B; b++) {
        const i = b * 4;
        let x = c.rot[o0 + i]!, y = c.rot[o0 + i + 1]!, z = c.rot[o0 + i + 2]!, w = c.rot[o0 + i + 3]!;
        let x1 = c.rot[o1 + i]!, y1 = c.rot[o1 + i + 1]!, z1 = c.rot[o1 + i + 2]!, w1 = c.rot[o1 + i + 3]!;
        if (x * x1 + y * y1 + z * z1 + w * w1 < 0) {
          x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1;
        }
        x += (x1 - x) * t; y += (y1 - y) * t; z += (z1 - z) * t; w += (w1 - w) * t;
        // align with the accumulator's hemisphere
        const s = acc[i]! * x + acc[i + 1]! * y + acc[i + 2]! * z + acc[i + 3]! * w < 0 ? -L.weight : L.weight;
        acc[i] = acc[i]! + x * s;
        acc[i + 1] = acc[i + 1]! + y * s;
        acc[i + 2] = acc[i + 2]! + z * s;
        acc[i + 3] = acc[i + 3]! + w * s;
      }
      const r0 = f0 * 3, r1 = f1 * 3;
      for (let k = 0; k < 3; k++) this.accRoot[k] = this.accRoot[k]! + (c.root[r0 + k]! + (c.root[r1 + k]! - c.root[r0 + k]!) * t) * L.weight;
    }
    if (total <= 0) return;
    for (let b = 0; b < B; b++) {
      const e = this.boneEnts[b];
      if (!e || (only && !only(this.assets.bones[b]!))) continue;
      const i = b * 4;
      this.quat.set(acc[i]!, acc[i + 1]!, acc[i + 2]!, acc[i + 3]!).normalize();
      e.setLocalRotation(this.quat);
    }
    if (this.rootBone && !only) {
      const s = this.rootScale / total;
      this.rootBone.setLocalPosition(this.accRoot[0]! * s, this.accRoot[1]! * s, this.accRoot[2]! * s);
    }
  }

  destroy() {
    this.root.destroy();
    Object.values(this.mats).forEach((m) => m.destroy());
  }
}
