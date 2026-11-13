/**
 * Realistic crowd: a handful of real athlete models (random looks) are posed seated and cheering,
 * rendered once into a texture atlas, then thousands of seats are filled with camera-facing cards
 * cut from that atlas. One draw call for the whole stand, cheap enough for phones.
 */
import * as pc from "playcanvas";
import type { AvatarConfig } from "@/lib/avatar";
import { HAIR_COLORS, KIT_COLORS, SKIN_TONES } from "@/lib/avatar";
import { Athlete, type AthleteAssets } from "./athlete.ts";

const COLS = 8;
const ROWS = 4; // rows 0-1 seated, rows 2-3 the same people cheering
const PEOPLE = 16;
const CELL_W = 0.8;
const CELL_H = 1.6;
const SHIRTS = [...KIT_COLORS, "#8b5cf6", "#ef4444", "#0ea5e9", "#f4f4f4", "#334155", "#b91c1c"];

export interface CrowdAtlas {
  texture: pc.Texture;
  destroy(): void;
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const UPPER = /^(spine|neck|head|clavicle|shoulder|upperarm|lowerarm|wrist)/;

/** Render the atlas (takes two frames). */
export function bakeCrowdAtlas(app: pc.AppBase, assets: AthleteAssets, seed = 7): Promise<CrowdAtlas> {
  const device = app.graphicsDevice;
  const size = device.maxTextureSize >= 2048 && Math.min(window.innerWidth, window.innerHeight) >= 700 ? 2048 : 1024;
  const texture = new pc.Texture(device, {
    name: "crowd-atlas", width: size, height: size, format: pc.PIXELFORMAT_RGBA8, mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, addressU: pc.ADDRESS_CLAMP_TO_EDGE, addressV: pc.ADDRESS_CLAMP_TO_EDGE,
  });
  const rt = new pc.RenderTarget({ colorBuffer: texture, depth: true, samples: 4 });
  const layer = new pc.Layer({ name: "CrowdBake" });
  app.scene.layers.push(layer);
  const root = new pc.Entity("crowd-bake");
  app.root.addChild(root);
  const cam = new pc.Entity("crowd-bake-cam");
  cam.addComponent("camera", {
    projection: pc.PROJECTION_ORTHOGRAPHIC, orthoHeight: (ROWS * CELL_H) / 2, clearColor: new pc.Color(0, 0, 0, 0),
    layers: [layer.id], renderTarget: rt, nearClip: 0.1, farClip: 50, priority: -10, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB,
  });
  // Looking at the fans from the court, slightly from above (like the broadcast camera).
  cam.setPosition((COLS * CELL_W) / 2, (ROWS * CELL_H) / 2 + 1.2, -12);
  cam.lookAt((COLS * CELL_W) / 2, (ROWS * CELL_H) / 2, 0);
  root.addChild(cam);
  const key = new pc.Entity();
  key.addComponent("light", { type: "directional", intensity: 1.6, color: new pc.Color(1, 0.97, 0.92), layers: [layer.id], castShadows: false });
  key.setEulerAngles(40, 160, 0);
  root.addChild(key);
  const fill = new pc.Entity();
  fill.addComponent("light", { type: "directional", intensity: 0.6, color: new pc.Color(0.75, 0.82, 1), layers: [layer.id], castShadows: false });
  fill.setEulerAngles(-20, -30, 0);
  root.addChild(fill);

  const rand = rng(seed);
  const sit = assets.clips["sit"]!;
  const cheer = assets.clips["cheer"]!;
  const people: Athlete[] = [];
  for (let i = 0; i < PEOPLE * 2; i++) {
    const p = i % PEOPLE;
    const r2 = rng(seed * 31 + p);
    const pk = <T,>(a: readonly T[]) => a[Math.floor(r2() * a.length)]!;
    const cfg: AvatarConfig = {
      version: 1, nickname: `fan${p}x${seed}`, genderPresentation: r2() < 0.5 ? "masculine" : "feminine", skinTone: pk(SKIN_TONES), face: "smile",
      hairstyle: pk(["short", "curly", "long", "ponytail", "buzz", "short"] as const), hairColor: pk(HAIR_COLORS.slice(0, 6)), outfit: "jersey",
      outfitColor: pk(SHIRTS) as AvatarConfig["outfitColor"], shoes: "runner", shoeColor: pk(KIT_COLORS), accessory: r2() < 0.18 ? "cap" : "none",
    };
    const a = new Athlete(assets, root, cfg, { shadows: false });
    a.setLayers([layer.id]);
    const col = p % COLS;
    const row = Math.floor(p / COLS) + (i >= PEOPLE ? 2 : 0);
    // Cell origin (bottom centre); model faces −Z (toward the camera).
    a.root.setPosition(col * CELL_W + CELL_W / 2, (ROWS - 1 - row) * CELL_H + 0.06, 0);
    a.root.setEulerAngles(0, (rand() - 0.5) * 24, 0);
    a.pose([{ clip: sit, time: rand() * sit.duration, weight: 1 }]);
    if (i >= PEOPLE) a.pose([{ clip: cheer, time: 1.0 + rand() * 0.6, weight: 1 }], (b) => UPPER.test(b));
    people.push(a);
  }
  return new Promise((resolve) => {
    let frames = 0;
    const done = () => {
      if (++frames < 2) return;
      app.off("frameend", done);
      people.forEach((p) => p.destroy());
      root.destroy();
      app.scene.layers.remove(layer);
      rt.destroy();
      resolve({ texture, destroy: () => texture.destroy() });
    };
    app.on("frameend", done);
  });
}

interface Fan {
  i: number; // vertex base
  cell: number;
  x: number; y: number; z: number;
  ax: number; az: number; // card right vector (horizontal)
  w: number; h: number;
  phase: number;
  excite: number;
  cheering: boolean;
}

/** Fills tiered stands with fan cards. Same layout options as the classic crowd. */
export class RealCrowd {
  private root: pc.Entity;
  private fans: Fan[] = [];
  private mesh: pc.Mesh;
  private pos: Float32Array;
  private uv: Float32Array;
  private mat: pc.StandardMaterial;
  private time = 0;
  private acc = 0;

  constructor(parent: pc.Entity, atlas: CrowdAtlas, device: pc.GraphicsDevice, opts: { innerX: number; zFrom: number; zTo: number; tiers: number; spacing: number; fill: number; sides?: number[]; seed?: number; seats?: pc.Material }) {
    this.root = new pc.Entity("real-crowd");
    parent.addChild(this.root);
    const rand = rng(opts.seed ?? 42);
    for (const side of opts.sides ?? [-1, 1]) {
      for (let tier = 0; tier < opts.tiers; tier++) {
        const x = side * (opts.innerX + tier * 0.6);
        const floor = tier * 0.42;
        if (opts.seats) {
          const step = new pc.Entity();
          step.addComponent("render", { type: "box", material: opts.seats, castShadows: false, receiveShadows: true });
          step.setLocalPosition(x + side * 0.05, floor / 2 - 0.02, (opts.zFrom + opts.zTo) / 2);
          step.setLocalScale(0.62, Math.max(0.04, floor), Math.abs(opts.zFrom - opts.zTo) + 0.6);
          this.root.addChild(step);
        }
        for (let z = opts.zFrom; z > opts.zTo; z -= opts.spacing) {
          if (rand() > opts.fill) continue;
          const s = 0.92 + rand() * 0.14;
          this.fans.push({
            i: 0, cell: Math.floor(rand() * PEOPLE), x: x + (rand() - 0.5) * 0.06, y: floor, z: z + (rand() - 0.5) * 0.12,
            ax: 0, az: side < 0 ? -1 : 1, w: CELL_W * s, h: CELL_H * s, phase: rand() * Math.PI * 2, excite: 0, cheering: false,
          });
        }
      }
    }
    const n = this.fans.length;
    this.pos = new Float32Array(n * 12);
    this.uv = new Float32Array(n * 8);
    const nrm = new Float32Array(n * 12);
    const idx = new Uint32Array(n * 6);
    this.fans.forEach((f, k) => {
      f.i = k * 4;
      idx.set([k * 4, k * 4 + 1, k * 4 + 2, k * 4, k * 4 + 2, k * 4 + 3], k * 6);
      this.write(f, 0);
    });
    // normals: cards face the court (−side along X in the stand's local frame)
    this.fans.forEach((f, k) => {
      for (let v = 0; v < 4; v++) nrm.set([f.az > 0 ? -1 : 1, 0, 0], (k * 4 + v) * 3);
    });
    this.mesh = new pc.Mesh(device);
    this.mesh.setPositions(this.pos);
    this.mesh.setNormals(nrm);
    this.mesh.setUvs(0, this.uv);
    this.mesh.setIndices(idx);
    this.mesh.update(pc.PRIMITIVE_TRIANGLES);
    const m = new pc.StandardMaterial();
    m.useLighting = false;
    m.useSkybox = false;
    m.diffuse = new pc.Color(0, 0, 0);
    m.emissive = new pc.Color(0.92, 0.92, 0.92);
    m.emissiveMap = atlas.texture;
    m.opacityMap = atlas.texture;
    m.opacityMapChannel = "a";
    m.alphaTest = 0.45;
    m.cull = pc.CULLFACE_NONE;
    m.update();
    this.mat = m;
    const mi = new pc.MeshInstance(this.mesh, m);
    mi.castShadow = false;
    const e = new pc.Entity("crowd-cards");
    e.addComponent("render", { meshInstances: [mi], castShadows: false, receiveShadows: false });
    this.root.addChild(e);
  }

  /** Write one card; bob = vertical lift (cheering jumps). Cards stand in the YZ plane facing the court. */
  private write(f: Fan, bob: number) {
    const cell = f.cell + (f.cheering ? PEOPLE : 0);
    const col = cell % COLS, row = Math.floor(cell / COLS);
    const u0 = col / COLS, u1 = (col + 1) / COLS;
    const v1 = 1 - row / ROWS, v0 = 1 - (row + 1) / ROWS;
    const hw = f.w / 2;
    // the card's right-hand direction as seen from the court
    const rz = f.az > 0 ? 1 : -1;
    const y0 = f.y + bob, y1 = f.y + bob + f.h;
    const p = this.pos, o = f.i * 3;
    p.set([f.x, y0, f.z - rz * hw, f.x, y0, f.z + rz * hw, f.x, y1, f.z + rz * hw, f.x, y1, f.z - rz * hw], o);
    const t = this.uv, q = f.i * 2;
    t.set([u0, v0, u1, v0, u1, v1, u0, v1], q);
  }

  /** 1 = big cheer, 0.5 = applause. */
  cheer(level: number) {
    for (const f of this.fans) f.excite = Math.max(f.excite, level * (0.6 + Math.random() * 0.4));
  }

  update(dt: number) {
    this.time += dt;
    this.acc += dt;
    if (this.acc < 1 / 15) return;
    const step = this.acc;
    this.acc = 0;
    let changed = false;
    for (const f of this.fans) {
      const was = f.cheering;
      f.excite = Math.max(0, f.excite - step * 0.35);
      f.cheering = f.excite > 0.45 || (f.excite > 0.2 && Math.sin(this.time * 3 + f.phase) > 0.6);
      const bob = f.excite > 0.6 ? Math.max(0, Math.sin(this.time * 9 + f.phase)) * 0.12 * f.excite : 0;
      if (was !== f.cheering || bob > 0 || f.excite > 0) {
        this.write(f, bob);
        changed = true;
      }
    }
    if (changed) {
      this.mesh.setPositions(this.pos);
      this.mesh.setUvs(0, this.uv);
      this.mesh.update(pc.PRIMITIVE_TRIANGLES, false);
    }
  }

  destroy() {
    this.root.destroy();
    this.mesh.destroy();
    this.mat.destroy();
  }
}
