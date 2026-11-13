/**
 * PlayCanvas racing renderer: real-photo sky, track ribbon with asphalt texture, kerbs on the
 * corners, tyre-wall barriers, start/finish gantry, themed scenery (city towers with lit windows,
 * seaside palms and sea, countryside trees and hills), detailed cars with spinning/steering wheels,
 * brake lights and headlights, tyre smoke, and a chase camera. Visual only.
 */
import * as pc from "playcanvas";
import { camLiveliness, getGameSettings } from "@/lib/game-settings";
import type { RaceState } from "./sim.ts";
import { RACE_THEMES, type RaceTheme } from "./themes.ts";
import { buildTrack, nearest, type Track, type TrackDef } from "./track.ts";

export type Quality = "high" | "low";

export interface RaceView {
  setState(s: RaceState): void;
  setViewer(car: number): void;
  setCars(cars: { color: string; helmet: string }[]): void;
  setQuality(q: Quality): void;
  destroy(): void;
}

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse || small ? "low" : "high";
}

function pcColor(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function mat(o: { color?: string; gloss?: number; metal?: number; map?: pc.Texture; emissive?: string; emissiveMap?: pc.Texture; clearCoat?: number; opacity?: number; noEnv?: boolean; twoSided?: boolean }) {
  const m = new pc.StandardMaterial();
  m.useMetalness = true;
  m.metalness = o.metal ?? 0;
  m.gloss = o.gloss ?? 0.35;
  if (o.color) m.diffuse = pcColor(o.color);
  if (o.map) m.diffuseMap = o.map;
  if (o.emissive) m.emissive = pcColor(o.emissive);
  if (o.emissiveMap) {
    m.emissiveMap = o.emissiveMap;
    m.emissive = new pc.Color(1, 1, 1);
  }
  if (o.clearCoat) {
    m.clearCoat = o.clearCoat;
    m.clearCoatGloss = 0.92;
  }
  if (o.opacity !== undefined) {
    m.opacity = o.opacity;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
  }
  if (o.noEnv) m.useSkybox = false;
  if (o.twoSided) m.cull = pc.CULLFACE_NONE;
  m.update();
  return m;
}

function canvasTex(device: pc.GraphicsDevice, c: HTMLCanvasElement, wrap = true) {
  const t = new pc.Texture(device, { width: c.width, height: c.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
  t.setSource(c);
  t.anisotropy = 8;
  if (wrap) {
    t.addressU = pc.ADDRESS_REPEAT;
    t.addressV = pc.ADDRESS_REPEAT;
  }
  return t;
}

function rnd(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function asphaltCanvas(theme: RaceTheme) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = theme.asphalt;
  ctx.fillRect(0, 0, c.width, c.height);
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const r = rnd(5);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * 34;
    img.data[i] = Math.max(0, img.data[i]! + n);
    img.data[i + 1] = Math.max(0, img.data[i + 1]! + n);
    img.data[i + 2] = Math.max(0, img.data[i + 2]! + n);
  }
  ctx.putImageData(img, 0, 0);
  // Darker racing line down the middle, white edge lines.
  const g = ctx.createLinearGradient(0, 0, c.width, 0);
  g.addColorStop(0.3, "rgba(0,0,0,0)");
  g.addColorStop(0.5, "rgba(0,0,0,0.18)");
  g.addColorStop(0.7, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(245,245,245,0.92)";
  ctx.fillRect(4, 0, 6, c.height);
  ctx.fillRect(c.width - 10, 0, 6, c.height);
  return c;
}

function stripeCanvas(a: string, b: string, n = 2, text?: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = i % 2 ? b : a;
    ctx.fillRect((i * c.width) / n, 0, c.width / n, c.height);
  }
  if (text) {
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.font = "800 34px 'Saira Condensed', 'Arial Narrow', sans-serif";
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
  }
  return c;
}

function windowsCanvas() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#06080e";
  ctx.fillRect(0, 0, c.width, c.height);
  const r = rnd(11);
  for (let y = 4; y < c.height; y += 10) {
    for (let x = 4; x < c.width; x += 9) {
      if (r() < 0.45) continue;
      const warm = r() < 0.7;
      ctx.fillStyle = warm ? `rgba(255,${200 + Math.floor(r() * 40)},140,${0.5 + r() * 0.5})` : `rgba(140,200,255,${0.4 + r() * 0.5})`;
      ctx.fillRect(x, y, 5, 6);
    }
  }
  return c;
}

/** Build a closed ribbon between two offsets from the centre line. */
function ribbon(device: pc.GraphicsDevice, t: Track, inner: (i: number) => [number, number, number], outer: (i: number) => [number, number, number], vPerMetre: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let k = 0; k <= t.n; k++) {
    const i = k % t.n;
    const a = inner(i), b = outer(i);
    pos.push(...a, ...b);
    // Normal: up for flat ribbons, sideways for vertical walls.
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    if (Math.abs(dy) > Math.hypot(dx, dz)) {
      const l = Math.hypot(t.tz[i]!, t.tx[i]!) || 1;
      nor.push(t.tz[i]! / l, 0, -t.tx[i]! / l, t.tz[i]! / l, 0, -t.tx[i]! / l);
    } else {
      nor.push(0, 1, 0, 0, 1, 0);
    }
    const v = (k === t.n ? t.length : t.s[i]!) * vPerMetre;
    uv.push(0, v, 1, v);
  }
  for (let k = 0; k < t.n; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const mesh = new pc.Mesh(device);
  mesh.setPositions(pos);
  mesh.setNormals(nor);
  mesh.setUvs(0, uv);
  mesh.setIndices(idx);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

interface CarView {
  root: pc.Entity;
  wheels: pc.Entity[];
  fronts: pc.Entity[];
  brake: pc.StandardMaterial;
  body: pc.StandardMaterial;
  helmet: pc.StandardMaterial;
  helmetE: pc.Entity;
  wheel: pc.Entity;
  spin: number;
}

export async function createRaceView(canvas: HTMLCanvasElement, trackId: TrackDef["id"], cars: number, initialQuality: Quality = detectQuality()): Promise<RaceView> {
  let quality = initialQuality;
  const theme = RACE_THEMES[trackId];
  const track = buildTrack(trackId);
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" } });
  const device = app.graphicsDevice;
  const ratio = () => (quality === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25));
  device.maxPixelRatio = ratio();
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(...theme.ambient);
  if (theme.night) {
    app.scene.fog.type = pc.FOG_LINEAR;
    app.scene.fog.color = new pc.Color(0.03, 0.04, 0.08);
    app.scene.fog.start = 150;
    app.scene.fog.end = 700;
  }

  const envAsset = new pc.Asset(`race-sky-${trackId}`, "texture", { url: theme.hdr }, { mipmaps: false });
  app.assets.add(envAsset);
  envAsset.ready(() => {
    try {
      const tex = envAsset.resource as pc.Texture;
      tex.projection = pc.TEXTUREPROJECTION_EQUIRECT;
      app.scene.skybox = pc.EnvLighting.generateSkyboxCubemap(tex);
      const lighting = pc.EnvLighting.generateLightingSource(tex);
      app.scene.envAtlas = pc.EnvLighting.generateAtlas(lighting);
      lighting.destroy();
      app.scene.skyboxIntensity = theme.skyIntensity;
    } catch (e) {
      console.warn("[racing] sky unavailable", e);
    }
  });
  app.assets.load(envAsset);

  const shadowType = (pc as unknown as Record<string, number>)["SHADOW_PCF3_32F"] ?? (pc as unknown as Record<string, number>)["SHADOW_PCF3"] ?? 0;
  const sun = new pc.Entity("sun");
  sun.addComponent("light", {
    type: "directional", color: new pc.Color(...theme.sunColor), intensity: theme.sunIntensity, castShadows: true,
    shadowResolution: quality === "high" ? 2048 : 1024, shadowDistance: 90, numCascades: quality === "high" ? 2 : 1, shadowType, shadowBias: 0.3, normalOffsetBias: 0.06,
  });
  sun.lookAt(new pc.Vec3(...theme.sunDir).normalize());
  sun.rotateLocal(90, 0, 0);
  app.root.addChild(sun);

  const add = (parent: pc.Entity, type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], shadows = true, rot?: [number, number, number]) => {
    const e = new pc.Entity();
    e.addComponent("render", { type, material: m, castShadows: shadows, receiveShadows: true });
    e.setLocalPosition(...pos);
    e.setLocalScale(scale[0], type === "capsule" ? scale[1] / 2 : scale[1], scale[2]);
    if (rot) e.setLocalEulerAngles(...rot);
    parent.addChild(e);
    return e;
  };
  const meshEntity = (parent: pc.Entity, mesh: pc.Mesh, m: pc.Material, shadows = false) => {
    const e = new pc.Entity();
    e.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, m)], castShadows: shadows, receiveShadows: true });
    parent.addChild(e);
    return e;
  };

  let world: pc.Entity | null = null;
  const textures: pc.Texture[] = [];
  const build = () => {
    world?.destroy();
    textures.splice(0).forEach((t) => t.destroy());
    const root = new pc.Entity("world");
    app.root.addChild(root);
    world = root;
    const hw = track.halfWidth, wall = track.wall;
    const L = (i: number, off: number, y = 0): [number, number, number] => [track.x[i]! + track.tz[i]! * off, y, track.z[i]! - track.tx[i]! * off];

    // Ground.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < track.n; i++) {
      minX = Math.min(minX, track.x[i]!); maxX = Math.max(maxX, track.x[i]!);
      minZ = Math.min(minZ, track.z[i]!); maxZ = Math.max(maxZ, track.z[i]!);
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    add(root, "plane", mat({ color: theme.ground, gloss: 0.1, noEnv: true }), [cx, -0.05, cz], [maxX - minX + 1600, 1, maxZ - minZ + 1600], false);
    if (theme.scenery === "coast") {
      add(root, "plane", mat({ color: "#145a74", gloss: 0.92, clearCoat: 0.8 }), [maxX + 520, -0.02, cz], [800, 1, maxZ - minZ + 1600], false);
    }

    // Run-off strips, asphalt, kerbs, barriers.
    meshEntity(root, ribbon(device, track, (i) => L(i, -wall, 0.005), (i) => L(i, wall, 0.005), 1 / 8), mat({ color: theme.runoff, gloss: 0.12, noEnv: true }));
    const asphalt = canvasTex(device, asphaltCanvas(theme));
    textures.push(asphalt);
    meshEntity(root, ribbon(device, track, (i) => L(i, -hw, 0.02), (i) => L(i, hw, 0.02), 1 / 14), mat({ map: asphalt, gloss: theme.night ? 0.5 : 0.3 }));
    const kerbTex = canvasTex(device, stripeCanvas("#d71f1f", "#f4f4f4", 2));
    textures.push(kerbTex);
    const kerbMat = mat({ map: kerbTex, gloss: 0.3 });
    // Kerbs only where the track bends.
    const kerb = (side: 1 | -1) => {
      const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
      let v = 0;
      for (let i = 0; i < track.n; i++) {
        if (Math.abs(track.curv[i]!) < 0.006) continue;
        const a = L(i, side * hw, 0.04), b = L(i, side * (hw + 1.3), 0.06);
        const j = (i + 1) % track.n;
        const c = L(j, side * hw, 0.04), d = L(j, side * (hw + 1.3), 0.06);
        const base = pos.length / 3;
        pos.push(...a, ...b, ...c, ...d);
        nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        uv.push(v, 0, v, 1, v + 0.5, 0, v + 0.5, 1);
        v += 0.5;
        if (side > 0) idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
        else idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
      }
      if (!idx.length) return;
      const mesh = new pc.Mesh(device);
      mesh.setPositions(pos);
      mesh.setNormals(nor);
      mesh.setUvs(0, uv);
      mesh.setIndices(idx);
      mesh.update(pc.PRIMITIVE_TRIANGLES);
      meshEntity(root, mesh, kerbMat);
    };
    kerb(1);
    kerb(-1);
    const wallTex = canvasTex(device, stripeCanvas(theme.barrier[0], theme.barrier[1], 4, "PLAYVERSE GP"));
    textures.push(wallTex);
    const wallMat = mat({ map: wallTex, gloss: 0.4, twoSided: true, ...(theme.night ? { emissiveMap: wallTex } : {}) });
    for (const side of [1, -1] as const) {
      meshEntity(root, ribbon(device, track, (i) => L(i, side * wall, 0), (i) => L(i, side * wall, 1.1), 1 / 12), wallMat, true);
    }

    // Start / finish: chequered line and gantry.
    const chk = document.createElement("canvas");
    chk.width = 128;
    chk.height = 16;
    const cctx = chk.getContext("2d")!;
    for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) {
      cctx.fillStyle = (x + y) % 2 ? "#111" : "#f5f5f5";
      cctx.fillRect(x * 8, y * 8, 8, 8);
    }
    const chkTex = canvasTex(device, chk, false);
    textures.push(chkTex);
    const h0 = (Math.atan2(track.tx[0]!, -track.tz[0]!) * 180) / Math.PI;
    add(root, "plane", mat({ map: chkTex, gloss: 0.3 }), [track.x[0]!, 0.03, track.z[0]!], [hw * 2, 1, 1.6], false, [0, -h0, 0]);
    const gantryMat = mat({ color: "#1d2333", metal: 0.5, gloss: 0.6 });
    const g = new pc.Entity("gantry");
    g.setLocalPosition(track.x[0]!, 0, track.z[0]!);
    g.setLocalEulerAngles(0, -h0, 0);
    root.addChild(g);
    add(g, "box", gantryMat, [-(hw + 2), 4, 0], [0.6, 8, 0.6]);
    add(g, "box", gantryMat, [hw + 2, 4, 0], [0.6, 8, 0.6]);
    const signTex = canvasTex(device, stripeCanvas("#0b1020", "#0b1020", 1, "PLAYVERSE GRAND PRIX"), false);
    textures.push(signTex);
    add(g, "box", mat({ map: signTex, emissiveMap: signTex }), [0, 7.6, 0], [hw * 2 + 5, 1.6, 0.4]);

    // Scenery.
    const r = rnd(trackId.length * 977);
    const spots = quality === "high" ? 260 : 120;
    const clear = (x: number, z: number, margin: number) => {
      const i = nearest(track, x, z);
      return Math.hypot(track.x[i]! - x, track.z[i]! - z) > wall + margin;
    };
    if (theme.scenery === "city") {
      const win = canvasTex(device, windowsCanvas());
      textures.push(win);
      const towerMats = ["#151a26", "#1b2133", "#22283a"].map((c) => mat({ color: c, map: win, emissiveMap: win, gloss: 0.6 }));
      for (let k = 0; k < spots * 0.6; k++) {
        const i = Math.floor(r() * track.n);
        const side = r() < 0.5 ? 1 : -1;
        const off = side * (wall + 18 + r() * 60);
        const [x, , z] = L(i, off);
        const w = 12 + r() * 18, d = 12 + r() * 18, h = 18 + r() * 70;
        if (!clear(x, z, Math.max(w, d) / 2 + 6)) continue;
        add(root, "box", towerMats[k % 3]!, [x, h / 2, z], [w, h, d], quality === "high");
      }
      // Street lights.
      const pole = mat({ color: "#2a2f3a", metal: 0.6 });
      const lamp = mat({ color: "#ffffff", emissive: "#ffe6b0" });
      for (let i = 0; i < track.n; i += 18) {
        const side = (i / 18) % 2 ? 1 : -1;
        const [x, , z] = L(i, side * (wall + 1.2));
        add(root, "cylinder", pole, [x, 4.5, z], [0.18, 9, 0.18], false);
        add(root, "box", lamp, [x - track.tz[i]! * side * 1.2, 9, z + track.tx[i]! * side * 1.2], [1.2, 0.25, 0.5], false);
      }
    } else {
      const trunk = mat({ color: "#5a3d26", gloss: 0.2, noEnv: true });
      const leafA = mat({ color: theme.scenery === "coast" ? "#4f9a3a" : "#2f6b2a", gloss: 0.15, noEnv: true });
      const leafB = mat({ color: theme.scenery === "coast" ? "#5aa844" : "#3d7a2e", gloss: 0.15, noEnv: true });
      const rock = mat({ color: "#8a8378", gloss: 0.2, noEnv: true });
      for (let k = 0; k < spots; k++) {
        const i = Math.floor(r() * track.n);
        const side = r() < 0.5 ? 1 : -1;
        const off = side * (wall + 6 + r() * 70);
        const [x, , z] = L(i, off);
        if (!clear(x, z, 4)) continue;
        const h = 6 + r() * 8;
        if (theme.scenery === "coast") {
          if (r() < 0.25) {
            add(root, "sphere", rock, [x, 0.4, z], [2 + r() * 3, 1.2 + r() * 1.5, 2 + r() * 3], false);
            continue;
          }
          const tr = add(root, "cylinder", trunk, [x, h / 2, z], [0.35, h, 0.35]);
          tr.setLocalEulerAngles((r() - 0.5) * 10, 0, (r() - 0.5) * 10);
          for (let f = 0; f < 6; f++) add(root, "cone", f % 2 ? leafA : leafB, [x, h, z], [1, 3.6, 0.45], false, [70, f * 60, 0]);
        } else if (r() < 0.5) {
          add(root, "cylinder", trunk, [x, 1.2, z], [0.45, 2.4, 0.45]);
          add(root, "cone", leafA, [x, h * 0.5, z], [h * 0.45, h * 0.75, h * 0.45]);
        } else {
          add(root, "cylinder", trunk, [x, h * 0.3, z], [0.5, h * 0.6, 0.5]);
          add(root, "sphere", r() < 0.5 ? leafA : leafB, [x, h * 0.7, z], [h * 0.6, h * 0.55, h * 0.6]);
        }
      }
      if (theme.scenery === "valley") {
        const hill = mat({ color: "#4a7a33", gloss: 0.05, noEnv: true });
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2;
          const R = Math.max(maxX - minX, maxZ - minZ) * 0.9 + 200;
          add(root, "sphere", hill, [cx + Math.cos(a) * R, -20, cz + Math.sin(a) * R], [300 + r() * 200, 90 + r() * 80, 300 + r() * 200], false);
        }
      }
    }
    // Grandstand by the start straight.
    const standMat = mat({ color: "#1f2a44", gloss: 0.3 });
    const fanMats = ["#e11d48", "#2f7bff", "#f2c230", "#2fbf71", "#f4f4f4", "#ff7a1a"].map((c) => mat({ color: c, gloss: 0.15, noEnv: true }));
    for (let i = 4; i < 40; i += 4) {
      for (let tier = 0; tier < 5; tier++) {
        const [x, , z] = L(i, -(wall + 3 + tier * 1.2));
        add(root, "box", standMat, [x, 0.4 + tier * 0.6, z], [2.2, 0.8 + tier * 1.2, 2.2], false);
        if (quality === "high" || tier % 2 === 0) add(root, "capsule", fanMats[(i + tier) % fanMats.length]!, [x, 1.4 + tier * 1.2, z], [0.5, 0.9, 0.4], false);
      }
    }
  };
  build();

  // Cars.
  const tyre = mat({ color: "#121212", gloss: 0.25 });
  const rim = mat({ color: "#c9ccd2", metal: 1, gloss: 0.8 });
  const glass = mat({ color: "#0d1520", gloss: 0.95, metal: 0.2, clearCoat: 1 });
  const head = mat({ color: "#ffffff", emissive: "#fff3cf" });
  const black = mat({ color: "#0a0a0a", gloss: 0.5 });
  const carViews: CarView[] = [];
  const makeCar = (color: string, helmet: string): CarView => {
    const root = new pc.Entity("car");
    app.root.addChild(root);
    const body = mat({ color, metal: 0.35, gloss: 0.75, clearCoat: 1 });
    const brake = mat({ color: "#3a0000", emissive: "#3a0000" });
    const helmetMat = mat({ color: helmet, gloss: 0.8, clearCoat: 0.6 });
    // Car faces −Z. Length 4.4 m, width 1.9 m.
    add(root, "box", body, [0, 0.48, 0], [1.9, 0.5, 4.4]);
    add(root, "box", body, [0, 0.82, 0.25], [1.6, 0.36, 2.0]);
    add(root, "box", glass, [0, 0.86, -0.55], [1.5, 0.3, 0.5], false, [-35, 0, 0]);
    add(root, "box", glass, [0, 0.86, 1.2], [1.5, 0.28, 0.45], false, [30, 0, 0]);
    add(root, "box", body, [0, 0.36, -2.1], [1.85, 0.22, 0.4]); // nose
    add(root, "box", black, [0, 0.25, -2.25], [1.7, 0.12, 0.25]); // splitter
    add(root, "box", black, [0, 1.12, 2.0], [1.7, 0.06, 0.4]); // wing
    add(root, "box", black, [-0.6, 0.95, 2.0], [0.06, 0.3, 0.3]);
    add(root, "box", black, [0.6, 0.95, 2.0], [0.06, 0.3, 0.3]);
    const helmetE = add(root, "sphere", helmetMat, [0, 0.95, 0.1], [0.32, 0.32, 0.34], false);
    // Dashboard and steering wheel (seen from the cockpit camera).
    add(root, "box", black, [0, 0.78, -0.5], [1.4, 0.1, 0.3], false);
    const wheel = new pc.Entity();
    wheel.setLocalPosition(0, 0.84, -0.32);
    wheel.setLocalEulerAngles(-65, 0, 0);
    root.addChild(wheel);
    add(wheel, "cylinder", black, [0, 0, 0], [0.34, 0.03, 0.34], false);
    add(wheel, "box", body, [0, 0.02, 0], [0.3, 0.02, 0.05], false);
    for (const x of [-0.65, 0.65]) {
      add(root, "box", head, [x, 0.52, -2.21], [0.42, 0.1, 0.05], false);
      add(root, "box", brake, [x, 0.6, 2.21], [0.45, 0.1, 0.05], false);
    }
    const wheels: pc.Entity[] = [], fronts: pc.Entity[] = [];
    for (const [x, z] of [[-0.92, -1.35], [0.92, -1.35], [-0.92, 1.35], [0.92, 1.35]] as const) {
      const steerPivot = new pc.Entity();
      steerPivot.setLocalPosition(x, 0.34, z);
      root.addChild(steerPivot);
      const spin = new pc.Entity();
      steerPivot.addChild(spin);
      add(spin, "cylinder", tyre, [0, 0, 0], [0.68, 0.32, 0.68], true, [0, 0, 90]);
      add(spin, "box", rim, [x > 0 ? 0.17 : -0.17, 0, 0], [0.02, 0.4, 0.12]);
      add(spin, "box", rim, [x > 0 ? 0.17 : -0.17, 0, 0], [0.02, 0.12, 0.4]);
      wheels.push(spin);
      if (z < 0) fronts.push(steerPivot);
    }
    return { root, wheels, fronts, brake, body, helmet: helmetMat, helmetE, wheel, spin: 0 };
  };
  for (let i = 0; i < cars; i++) carViews.push(makeCar(["#e11d48", "#2f7bff", "#f2c230", "#2fbf71", "#ff7a1a", "#e8eaf0"][i % 6]!, "#ffffff"));
  // Player headlights (only the viewer's car, to keep lights cheap).
  const lights = new pc.Entity("headlights");
  lights.addComponent("light", { type: "spot", color: new pc.Color(1, 0.96, 0.88), intensity: theme.night ? 3 : 0.6, range: 60, innerConeAngle: 18, outerConeAngle: 34, castShadows: false });
  lights.setLocalPosition(0, 0.7, -2.3);
  lights.setLocalEulerAngles(-82, 0, 0);

  // Tyre smoke pool.
  const smokeMat = mat({ color: "#d8d8d8", opacity: 0.35, noEnv: true });
  const smoke = Array.from({ length: quality === "high" ? 60 : 30 }, () => {
    const e = add(app.root, "sphere", smokeMat, [0, -10, 0], [1, 1, 1], false);
    return { e, life: 0 };
  });
  let smokeNext = 0;

  const camera = new pc.Entity("camera");
  camera.addComponent("camera", { fov: 62, nearClip: 0.1, farClip: 2500, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB });
  app.root.addChild(camera);
  const camPos = new pc.Vec3(track.x[0]!, 30, track.z[0]! + 40);
  const camLook = new pc.Vec3(track.x[0]!, 0, track.z[0]!);
  const want = new pc.Vec3(), wantLook = new pc.Vec3();

  let state: RaceState | null = null;
  let viewer = 0;
  let elapsed = 0;

  app.on("update", (dt: number) => {
    elapsed += dt;
    const s = state;
    if (!s) return;
    s.cars.forEach((c, i) => {
      const v = carViews[i];
      if (!v) return;
      v.root.setPosition(c.x, 0, c.z);
      // Body roll/pitch from slide and braking.
      v.root.setEulerAngles(c.input.brake * 1.2, (-c.h * 180) / Math.PI, -c.drift * 3 * Math.sign(c.yaw || 1));
      const speed = Math.hypot(c.vx, c.vz);
      const fwd = c.vx * Math.sin(c.h) - c.vz * Math.cos(c.h);
      v.spin += (fwd / 0.34) * dt * (180 / Math.PI);
      v.wheels.forEach((w) => w.setLocalEulerAngles(-v.spin, 0, 0));
      v.fronts.forEach((f) => f.setLocalEulerAngles(0, (-c.steer * 180) / Math.PI, 0));
      v.wheel.setLocalEulerAngles(-65, 0, (c.steer * 180 * 2.5) / Math.PI);
      const braking = c.input.brake > 0.1 && fwd > 1;
      v.brake.emissive = braking ? new pc.Color(1, 0.05, 0.05) : new pc.Color(0.25, 0, 0);
      v.brake.update();
      if (c.drift > 0.35 && speed > 8 && !c.offTrack) {
        for (const sx of [-0.9, 0.9]) {
          const p = smoke[smokeNext++ % smoke.length]!;
          p.life = 1;
          p.e.setPosition(c.x + Math.cos(c.h) * sx - Math.sin(c.h) * 1.4, 0.3, c.z + Math.sin(c.h) * sx + Math.cos(c.h) * 1.4);
        }
      }
    });
    for (const p of smoke) {
      if (p.life <= 0) continue;
      p.life -= dt * 0.9;
      const sz = 0.6 + (1 - p.life) * 2.4;
      p.e.setLocalScale(sz, sz * 0.7, sz);
      const q = p.e.getPosition();
      p.e.setPosition(q.x, q.y + dt * 0.6, q.z);
      if (p.life <= 0) p.e.setPosition(0, -10, 0);
    }

    // Camera: chase (default), close chase, bonnet or cockpit, chosen in Controls & Camera settings.
    const me = s.cars[viewer];
    if (me) {
      const settings = getGameSettings();
      const live = camLiveliness(settings);
      const view = settings.raceView;
      const portrait = canvas.clientHeight > canvas.clientWidth;
      const fx = Math.sin(me.h), fz = -Math.cos(me.h);
      const speed = Math.hypot(me.vx, me.vz);
      const cam = camera.camera!;
      const inside = (view === "bonnet" || view === "cockpit") && s.phase !== "finished" && !me.finished;
      const mine = carViews[viewer];
      if (mine) mine.helmetE.enabled = !(inside && view === "cockpit");
      // Brief, gentle reaction to impacts (no shake), fading in half a second.
      const bump = Math.max(0, 1 - (s.t - me.hit) / 0.5) * live;
      if (s.phase === "finished" || me.finished) {
        const a = elapsed * 0.3;
        want.set(me.x + Math.sin(a) * 9, 3.5, me.z + Math.cos(a) * 9);
        wantLook.set(me.x, 0.8, me.z);
        const k = 1 - Math.exp(-dt * 3);
        camPos.lerp(camPos, want, k);
        camLook.lerp(camLook, wantLook, k);
        camera.setPosition(camPos);
        camera.lookAt(camLook);
        cam.fov += ((portrait ? 72 : 58) - cam.fov) * k;
      } else if (inside) {
        // Rigidly attached to the car: no lag, so steering stays precise.
        // Bonnet: above the front of the car; cockpit: the driver's eyes (helmet hidden).
        const fwd = view === "bonnet" ? 0.95 : -0.05, upOff = view === "bonnet" ? 1.12 : 0.98;
        camPos.set(me.x + fx * fwd, upOff + bump * 0.04, me.z + fz * fwd);
        camLook.set(me.x + fx * 30, 0.9 - me.input.brake * 0.15 * live, me.z + fz * 30);
        camera.setPosition(camPos);
        camera.lookAt(camLook);
        cam.fov = (portrait ? 78 : view === "cockpit" ? 70 : 64) + (settings.camMode === "steady" ? 0 : Math.min(6, speed * 0.06));
      } else {
        const close = view === "close";
        // Pull back with speed; look a little into the coming corner, not just along the nose.
        const back = (close ? (portrait ? 5.4 : 4.3) : portrait ? 7.5 : 6.2) + live * Math.min(2.2, speed * 0.035);
        const up = close ? (portrait ? 2.4 : 1.65) : portrait ? 3.1 : 2.3;
        const n = track.n;
        const ahead = (me.idx + Math.round(8 + speed * 0.2)) % n;
        const tx = track.x[ahead]! - me.x, tz = track.z[ahead]! - me.z;
        const tl = Math.max(1, Math.hypot(tx, tz));
        const corner = 0.3 * live;
        const lx = fx * (1 - corner) + (tx / tl) * corner, lz = fz * (1 - corner) + (tz / tl) * corner;
        if (s.phase === "countdown") {
          want.set(me.x - fx * back, up, me.z - fz * back);
          wantLook.set(me.x + fx * 6, 1.1, me.z + fz * 6);
        } else {
          // Show the slide angle a little when drifting (follow travel direction partly).
          const vl = Math.max(1, speed);
          const slide = speed > 3 ? 0.3 * live : 0;
          const dx = fx * (1 - slide) + (me.vx / vl) * slide, dz = fz * (1 - slide) + (me.vz / vl) * slide;
          want.set(me.x - dx * back, up + bump * 0.15, me.z - dz * back);
          wantLook.set(me.x + lx * 7, 1.1, me.z + lz * 7);
        }
        // Lead the target by the car's velocity so smoothing never leaves the camera behind.
        const rate = s.phase === "countdown" ? 2 : close ? 13 : 10;
        if (s.phase === "racing") want.set(want.x + me.vx / rate, want.y, want.z + me.vz / rate);
        const k = 1 - Math.exp(-dt * rate);
        camPos.lerp(camPos, want, k);
        camLook.lerp(camLook, wantLook, Math.min(1, k * (settings.camMode === "steady" ? 1 : 1.6)));
        camPos.y = Math.max(camPos.y, 0.8); // never below the road
        camera.setPosition(camPos);
        camera.lookAt(camLook);
        const target = (portrait ? 72 : close ? 62 : 58) + (settings.camMode === "steady" ? 0 : Math.min(10, speed * 0.1));
        cam.fov += (target - cam.fov) * (1 - Math.exp(-dt * 4));
      }
      if (lights.parent !== carViews[viewer]?.root) {
        lights.parent?.removeChild(lights);
        carViews[viewer]?.root.addChild(lights);
      }
    }
  });

  const resize = () => {
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (rect) app.resizeCanvas(Math.max(1, rect.width), Math.max(1, rect.height));
  };
  const ro = new ResizeObserver(resize);
  if (canvas.parentElement) ro.observe(canvas.parentElement);
  resize();
  app.start();

  return {
    setState(s) {
      state = s;
    },
    setViewer(v) {
      viewer = v;
    },
    setCars(list) {
      list.forEach((c, i) => {
        const v = carViews[i];
        if (!v) return;
        v.body.diffuse = pcColor(c.color);
        v.body.update();
        v.helmet.diffuse = pcColor(c.helmet);
        v.helmet.update();
      });
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      device.maxPixelRatio = ratio();
      build();
      resize();
    },
    destroy() {
      ro.disconnect();
      app.destroy();
    },
  };
}
