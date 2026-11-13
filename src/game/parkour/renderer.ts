/**
 * Rooftop Rush renderer (PlayCanvas): golden-hour city with layered skyline and lit windows,
 * rooftops with gravel, parapets, water towers, antennas and neon billboards; the course's vents,
 * pipes, gaps, walls and speed pads; start and finish arches; runners with dust, speed trails and
 * sparkles; and a side-on chase camera that frames the action on landscape and portrait screens.
 */
import * as pc from "playcanvas";
import type { AvatarConfig } from "@/lib/avatar";
import { createHumanoid, type Humanoid } from "../character/humanoid.ts";
import { ParkourAnimator } from "./anim.ts";
import type { Course, RaceState } from "./sim.ts";

export type Quality = "high" | "low";

export interface ParkourView {
  setCourse(c: Course, count: number): void;
  setRunners(list: { avatar: AvatarConfig | null; color: string }[]): void;
  setState(s: RaceState, viewer: number, celebrate: number[]): void;
  fx(kind: "perfect" | "pad" | "land" | "hit" | "finish", i: number): void;
  setQuality(q: Quality): void;
  destroy(): void;
}

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse || small ? "low" : "high";
}

export const LANE_GAP = 1.5;

function col(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function mat(o: { color?: string; gloss?: number; metal?: number; map?: pc.Texture; tiling?: [number, number]; emissive?: string; emissiveMap?: pc.Texture; emissiveIntensity?: number; noEnv?: boolean; opacity?: number; additive?: boolean }) {
  const m = new pc.StandardMaterial();
  m.useMetalness = true;
  m.metalness = o.metal ?? 0;
  m.gloss = o.gloss ?? 0.3;
  if (o.color) m.diffuse = col(o.color);
  if (o.map) {
    m.diffuseMap = o.map;
    if (o.tiling) m.diffuseMapTiling = new pc.Vec2(...o.tiling);
  }
  if (o.emissive) m.emissive = col(o.emissive);
  if (o.emissiveMap) {
    m.emissiveMap = o.emissiveMap;
    m.emissive = new pc.Color(1, 1, 1);
    if (o.tiling) m.emissiveMapTiling = new pc.Vec2(...o.tiling);
  }
  if (o.emissiveIntensity) m.emissiveIntensity = o.emissiveIntensity;
  if (o.opacity !== undefined) {
    m.opacity = o.opacity;
    m.blendType = o.additive ? pc.BLEND_ADDITIVE : pc.BLEND_NORMAL;
    m.depthWrite = false;
  }
  if (o.noEnv) m.useSkybox = false;
  m.update();
  return m;
}
function tex(device: pc.GraphicsDevice, c: HTMLCanvasElement, repeat = true) {
  const t = new pc.Texture(device, { width: c.width, height: c.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
  t.setSource(c);
  t.anisotropy = 8;
  if (repeat) {
    t.addressU = pc.ADDRESS_REPEAT;
    t.addressV = pc.ADDRESS_REPEAT;
  }
  return t;
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!] as const;
}
function rand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Facade: rows of windows, some lit warm, some cool, most dark. */
function windowsCanvas(base: string, litRatio: number, seed: number) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  const r = rand(seed);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const lit = r() < litRatio;
      ctx.fillStyle = lit ? (r() < 0.75 ? `hsl(${38 + r() * 12},95%,${62 + r() * 18}%)` : `hsl(${190 + r() * 20},70%,75%)`) : `rgba(10,14,28,${0.75 + r() * 0.2})`;
      ctx.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
    }
  }
  return c;
}
function windowsEmissive(litRatio: number, seed: number) {
  const [c, ctx] = canvas(256, 256);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 256, 256);
  const r = rand(seed);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      if (r() >= litRatio) continue;
      ctx.fillStyle = r() < 0.75 ? `hsl(${38 + r() * 12},95%,${45 + r() * 15}%)` : `hsl(${195 + r() * 20},70%,55%)`;
      ctx.fillRect(x * 32 + 6, y * 32 + 7, 20, 18);
    }
  }
  return c;
}
function noise(base: string, amp: number, size = 256, seed = 7) {
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  let s = seed;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) >>> 0;
    const n = ((s / 4294967296) - 0.5) * amp;
    for (let k = 0; k < 3; k++) img.data[i + k] = Math.max(0, Math.min(255, img.data[i + k]! + n));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}
function signCanvas(text: string, color: string, bg = "#0b0716") {
  const [c, ctx] = canvas(512, 128);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  ctx.font = "900 78px 'Saira Condensed', 'Arial Narrow', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 68);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffffff";
  ctx.globalAlpha = 0.65;
  ctx.fillText(text, 256, 68);
  return c;
}

export async function createParkourView(cv: HTMLCanvasElement, initialQuality: Quality = detectQuality()): Promise<ParkourView> {
  let quality = initialQuality;
  const app = new pc.Application(cv, { graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" } });
  const device = app.graphicsDevice;
  const ratio = () => (quality === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25));
  device.maxPixelRatio = ratio();
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.36, 0.3, 0.38);
  const sceneAny = app.scene as unknown as { fog?: { type: string; color: pc.Color; start: number; end: number }; fogType?: string; fogColor?: pc.Color; fogStart?: number; fogEnd?: number };
  const fogColor = new pc.Color(0.95, 0.55, 0.42);
  if (sceneAny.fog && typeof sceneAny.fog === "object") {
    sceneAny.fog.type = "linear";
    sceneAny.fog.color = fogColor;
    sceneAny.fog.start = 70;
    sceneAny.fog.end = 330;
  } else {
    sceneAny.fogType = "linear";
    sceneAny.fogColor = fogColor;
    sceneAny.fogStart = 70;
    sceneAny.fogEnd = 330;
  }

  // Environment light for nice metal/gloss response.
  const envAsset = new pc.Asset("pk-env", "texture", { url: "/assets/env/oceanfront.hdr" }, { mipmaps: false });
  app.assets.add(envAsset);
  envAsset.ready(() => {
    try {
      const t = envAsset.resource as pc.Texture;
      t.projection = pc.TEXTUREPROJECTION_EQUIRECT;
      const lighting = pc.EnvLighting.generateLightingSource(t);
      app.scene.envAtlas = pc.EnvLighting.generateAtlas(lighting);
      lighting.destroy();
      app.scene.skyboxIntensity = 0.6;
    } catch (e) {
      console.warn("[parkour] env unavailable", e);
    }
  });
  app.assets.load(envAsset);

  const shadowType = (pc as unknown as Record<string, number>)["SHADOW_PCF3_32F"] ?? (pc as unknown as Record<string, number>)["SHADOW_PCF3"] ?? 0;
  const sun = new pc.Entity("sun");
  sun.addComponent("light", { type: "directional", color: new pc.Color(1, 0.78, 0.55), intensity: 1.7, castShadows: true, shadowResolution: quality === "high" ? 2048 : 1024, shadowDistance: 45, numCascades: 1, shadowType, shadowBias: 0.3, normalOffsetBias: 0.06 });
  sun.lookAt(new pc.Vec3(-0.55, -0.45, -0.7).normalize());
  sun.rotateLocal(90, 0, 0);
  app.root.addChild(sun);
  const rim = new pc.Entity("rim");
  rim.addComponent("light", { type: "directional", color: new pc.Color(0.55, 0.65, 1), intensity: 0.55, castShadows: false });
  rim.lookAt(new pc.Vec3(0.4, -0.3, 0.8).normalize());
  rim.rotateLocal(90, 0, 0);
  app.root.addChild(rim);

  const add = (parent: pc.Entity, type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], shadows = false, rot?: [number, number, number]) => {
    const e = new pc.Entity();
    e.addComponent("render", { type, material: m, castShadows: shadows, receiveShadows: true });
    e.setLocalPosition(...pos);
    e.setLocalScale(scale[0], type === "capsule" ? scale[1] / 2 : scale[1], scale[2]);
    if (rot) e.setLocalEulerAngles(...rot);
    parent.addChild(e);
    return e;
  };

  // Sky dome: deep blue to sunset orange, with the sun's glow.
  const [skyC, skyX] = canvas(16, 512);
  const g = skyX.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#1b1f4b");
  g.addColorStop(0.35, "#5a3d7a");
  g.addColorStop(0.5, "#e0646a");
  g.addColorStop(0.58, "#ffa25a");
  g.addColorStop(0.64, "#ffd08a");
  g.addColorStop(1, "#2a1830");
  skyX.fillStyle = g;
  skyX.fillRect(0, 0, 16, 512);
  const skyTex = tex(device, skyC, false);
  const sky = new pc.Entity("sky");
  const skyMat = mat({ color: "#000000", emissiveMap: skyTex, noEnv: true });
  skyMat.cull = pc.CULLFACE_FRONT;
  skyMat.useFog = false;
  skyMat.update();
  sky.addComponent("render", { type: "sphere", material: skyMat, castShadows: false, receiveShadows: false });
  sky.setLocalScale(1400, 1400, 1400);
  app.root.addChild(sky);
  const sunDisc = new pc.Entity();
  const sunMat = mat({ color: "#000000", emissive: "#ffe2a8", emissiveIntensity: 2, noEnv: true });
  sunMat.useFog = false;
  sunMat.update();
  sunDisc.addComponent("render", { type: "sphere", material: sunMat, castShadows: false });
  sunDisc.setLocalScale(42, 42, 42);
  app.root.addChild(sunDisc);

  const M = {
    gravel: mat({ map: tex(device, noise("#6f6a66", 46, 256, 3)), tiling: [1, 1], gloss: 0.12 }),
    parapet: mat({ color: "#8a8077", gloss: 0.15 }),
    metal: mat({ color: "#a9b0ba", metal: 0.8, gloss: 0.55 }),
    darkMetal: mat({ color: "#2e333d", metal: 0.6, gloss: 0.5 }),
    grille: mat({ map: tex(device, (() => { const [c, x] = canvas(64, 64); x.fillStyle = "#6c737e"; x.fillRect(0, 0, 64, 64); x.fillStyle = "#2a2e35"; for (let k = 0; k < 8; k++) x.fillRect(0, k * 8 + 2, 64, 3); return c; })()), metal: 0.6, gloss: 0.4 }),
    pipe: mat({ color: "#d9a13a", metal: 0.7, gloss: 0.6 }),
    stripe: mat({ map: tex(device, (() => { const [c, x] = canvas(64, 16); for (let k = 0; k < 8; k++) { x.fillStyle = k % 2 ? "#111" : "#ffcc00"; x.beginPath(); x.moveTo(k * 8, 0); x.lineTo(k * 8 + 8, 0); x.lineTo(k * 8, 16); x.lineTo(k * 8 - 8, 16); x.fill(); } return c; })()), gloss: 0.3 }),
    wood: mat({ color: "#5b3a22", gloss: 0.2 }),
    tank: mat({ color: "#6b4a33", gloss: 0.25 }),
    red: mat({ color: "#300", emissive: "#ff2020", noEnv: true }),
    white: mat({ color: "#f2f2f2", gloss: 0.3 }),
    alley: mat({ color: "#120e18", gloss: 0.1 }),
    shadow: mat({ color: "#000000", opacity: 0.35, noEnv: true }),
    trail: mat({ color: "#000000", emissive: "#3ef0ff", opacity: 0.35, additive: true, noEnv: true }),
    spark: mat({ color: "#000000", emissive: "#ffd23f", opacity: 0.9, additive: true, noEnv: true }),
    dust: mat({ color: "#b9ab9b", opacity: 0.45, noEnv: true }),
    bulb: mat({ color: "#000", emissive: "#ffd69a", noEnv: true }),
  };
  const padTex = (() => {
    const [c, x] = canvas(256, 64);
    x.fillStyle = "#03202a";
    x.fillRect(0, 0, 256, 64);
    x.strokeStyle = "#3ef0ff";
    x.lineWidth = 9;
    x.shadowColor = "#3ef0ff";
    x.shadowBlur = 12;
    for (let k = 0; k < 4; k++) {
      x.beginPath();
      x.moveTo(30 + k * 58, 10);
      x.lineTo(62 + k * 58, 32);
      x.lineTo(30 + k * 58, 54);
      x.stroke();
    }
    return tex(device, c, false);
  })();
  const padMat = mat({ color: "#000", emissiveMap: padTex, emissiveIntensity: 1.6, noEnv: true });
  const finishTex = (() => {
    const [c, x] = canvas(256, 64);
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? "#111" : "#fff"; x.fillRect(i * 16, j * 16, 16, 16); }
    return tex(device, c, false);
  })();

  const facades: pc.StandardMaterial[] = [];
  const facadeMat = (k: number, w: number, h: number) => {
    const bases = ["#3b3f52", "#4b3c3a", "#2f4250", "#514a5c", "#3c4a3f", "#5a4a3a"];
    const seed = 11 + k * 7;
    const mm = mat({ map: tex(device, windowsCanvas(bases[k % bases.length]!, 0.35, seed)), emissiveMap: tex(device, windowsEmissive(0.35, seed)), tiling: [Math.max(1, w / 8), Math.max(1, h / 8)], gloss: 0.25 });
    mm.emissiveIntensity = 0.9;
    mm.update();
    facades.push(mm);
    return mm;
  };

  let world: pc.Entity | null = null;
  let course: Course | null = null;
  let lanes = 4;
  const blink: pc.Entity[] = [];
  const signs: { e: pc.Entity; m: pc.StandardMaterial; ph: number }[] = [];

  /** Far skyline layers (parallax depth), independent of the course. */
  const buildSkyline = (root: pc.Entity, from: number, to: number) => {
    const layers = quality === "high" ? [[-60, 1.0], [-120, 0.75], [-210, 0.5]] : [[-80, 0.9], [-190, 0.55]];
    const r = rand(99);
    layers.forEach(([z, shade], li) => {
      const base = `rgb(${Math.round(40 * shade!)},${Math.round(38 * shade!)},${Math.round(62 * shade!)})`;
      const m = mat({ map: tex(device, windowsCanvas(base, 0.3, 50 + li)), emissiveMap: tex(device, windowsEmissive(0.3 * shade!, 50 + li)), tiling: [3, 6], gloss: 0.1 });
      let x = from - 80;
      while (x < to + 120) {
        const w = 10 + r() * 22;
        const h = 18 + r() * (50 + li * 40);
        add(root, "box", m, [x + w / 2, h / 2 - 30, z! - r() * 20], [w, h + 30, 10 + r() * 12]);
        if (r() < 0.3) {
          const a = add(root, "cylinder", M.darkMetal, [x + w / 2, h - 15 + 4, z! - 5], [0.4, 8, 0.4]);
          blink.push(add(a, "sphere", M.red, [0, 0.52, 0], [3.5, 0.12, 3.5]));
        }
        x += w + 2 + r() * 8;
      }
    });
  };

  const build = () => {
    world?.destroy();
    blink.length = 0;
    signs.length = 0;
    facades.splice(0).forEach((m) => m.destroy());
    if (!course) return;
    const root = new pc.Entity("city");
    app.root.addChild(root);
    world = root;
    const c = course;
    const depth = lanes * LANE_GAP + 5;
    const zFront = 2.2, zBack = zFront - depth;
    const zMid = (zFront + zBack) / 2;
    buildSkyline(root, -30, c.length + 40);
    const r = rand(c.seed + 3);
    // Course buildings (one per roof segment).
    c.segments.forEach((sg, k) => {
      const w = sg.x1 - sg.x0;
      const h = sg.y + 40;
      const bm = facadeMat(k, w, h);
      add(root, "box", bm, [(sg.x0 + sg.x1) / 2, sg.y - h / 2, zMid], [w, h, depth], false);
      // Roof surface.
      const rm = mat({ map: tex(device, noise(["#6f6a66", "#6a6560", "#76706a"][k % 3]!, 46, 256, k + 3)), tiling: [w / 4, depth / 4], gloss: 0.12 });
      facades.push(rm);
      add(root, "box", rm, [(sg.x0 + sg.x1) / 2, sg.y - 0.05, zMid], [w, 0.1, depth], false);
      // Parapets front and back (low at the front so runners stay visible).
      add(root, "box", M.parapet, [(sg.x0 + sg.x1) / 2, sg.y + 0.15, zFront + 0.15], [w, 0.3, 0.3], false);
      add(root, "box", M.parapet, [(sg.x0 + sg.x1) / 2, sg.y + 0.5, zBack - 0.15], [w, 1, 0.3], true);
      // Rooftop decor at the back: water towers, AC stacks, antennas, billboards.
      let x = sg.x0 + 4;
      while (x < sg.x1 - 4) {
        const pick = r();
        const bz = zBack - 1.4;
        if (pick < 0.22) {
          const tw = new pc.Entity();
          tw.setLocalPosition(x, sg.y, bz - 1);
          root.addChild(tw);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(tw, "box", M.darkMetal, [dx * 1.1, 1.8, dz * 1.1], [0.15, 3.6, 0.15]);
          add(tw, "cylinder", M.tank, [0, 4.6, 0], [3, 2.6, 3], true);
          add(tw, "cone", M.tank, [0, 6.3, 0], [3.2, 0.9, 3.2]);
        } else if (pick < 0.42) {
          const text = ["PLAYVERSE", "ROOFTOP RUSH", "GO FASTER", "NO LIMITS", "CITY RUN"][Math.floor(r() * 5)]!;
          const colr = ["#ff3fb4", "#3ef0ff", "#ffd23f", "#7cff6b"][Math.floor(r() * 4)]!;
          const sm = mat({ color: "#000", emissiveMap: tex(device, signCanvas(text, colr), false), emissiveIntensity: 1.4, noEnv: true });
          facades.push(sm);
          add(root, "box", M.darkMetal, [x - 2.6, sg.y + 1.6, bz], [0.15, 3.2, 0.15]);
          add(root, "box", M.darkMetal, [x + 2.6, sg.y + 1.6, bz], [0.15, 3.2, 0.15]);
          const s = add(root, "plane", sm, [x, sg.y + 3.6, bz], [6.4, 1, 1.6], false, [90, 0, 0]);
          signs.push({ e: s, m: sm, ph: r() * 10 });
        } else if (pick < 0.6) {
          add(root, "box", M.metal, [x, sg.y + 0.7, bz], [2.2, 1.4, 1.6], true);
          add(root, "cylinder", M.darkMetal, [x, sg.y + 1.45, bz], [1.2, 0.1, 1.2]);
        } else if (pick < 0.72) {
          const a = add(root, "cylinder", M.darkMetal, [x, sg.y + 3, bz], [0.12, 6, 0.12]);
          const tip = add(a, "sphere", M.red, [0, 0.52, 0], [2.5, 0.05, 2.5]);
          blink.push(tip);
        }
        x += 6 + r() * 7;
      }
      // String lights along the back parapet.
      if (quality === "high" && w > 12) {
        for (let lx = sg.x0 + 1; lx < sg.x1 - 1; lx += 1.6) add(root, "sphere", M.bulb, [lx, sg.y + 1.15 + Math.sin((lx - sg.x0) / w * Math.PI) * -0.25, zBack - 0.15], [0.12, 0.12, 0.12]);
      }
    });
    // Alleys between buildings (dark gulf visible through gaps).
    add(root, "box", M.alley, [c.length / 2, -40, zMid - 2], [c.length + 200, 1, depth + 30]);

    // Obstacles.
    c.obstacles.forEach((o) => {
      if (o.kind === "vent") {
        for (let l = 0; l < lanes; l++) {
          const z = -l * LANE_GAP;
          const v = add(root, "box", M.grille, [o.x + o.w / 2, o.y + o.h / 2, z], [o.w, o.h, 1.1], true);
          void v;
          add(root, "box", M.metal, [o.x + o.w / 2, o.y + o.h + 0.03, z], [o.w + 0.08, 0.06, 1.18]);
          add(root, "cylinder", M.darkMetal, [o.x + o.w / 2, o.y + o.h + 0.07, z], [Math.min(0.7, o.w * 0.8), 0.04, 0.7]);
        }
      } else if (o.kind === "pipe") {
        const top = o.y + o.h;
        const span = depth - 0.6;
        // Horizontal steam pipes or a hazard beam, on posts at both ends.
        add(root, "cylinder", M.pipe, [o.x + o.w / 2, top + 0.22, zMid], [0.44, span, 0.44], true, [90, 0, 0]);
        if (o.w > 1) add(root, "cylinder", M.pipe, [o.x + o.w / 2, top + 0.62, zMid], [0.3, span, 0.3], true, [90, 0, 0]);
        add(root, "box", M.stripe, [o.x + o.w / 2, top + 0.22, zFront + 0.05], [Math.max(0.5, o.w), 0.3, 0.06]);
        for (const z of [zFront - 0.1, zBack + 0.2]) add(root, "box", M.darkMetal, [o.x + o.w / 2, o.y + (top - o.y + 0.5) / 2, z], [0.16, top - o.y + 0.5, 0.16], true);
      } else if (o.kind === "pad") {
        for (let l = 0; l < lanes; l++) add(root, "box", padMat, [o.x + o.w / 2, o.y + 0.02, -l * LANE_GAP], [o.w, 0.04, 1.1]);
      } else if (o.kind === "gap") {
        // Edge warning stripe on the take-off ledge.
        add(root, "box", M.stripe, [o.x - 0.15, o.y + 0.01, zMid], [0.3, 0.02, depth - 0.5], false, [0, 90, 0]);
      } else if (o.kind === "wall") {
        // Ledge trim at the top of the climb.
        add(root, "box", M.metal, [o.x + 0.05, o.y + o.h + 0.04, zMid], [0.12, 0.08, depth]);
        add(root, "box", M.stripe, [o.x - 0.02, o.y + 0.8, zMid], [0.04, 0.25, depth - 0.4], false, [0, 90, 0]);
      }
    });

    // Start and finish arches.
    const arch = (x: number, yy: number, label: string, banner: pc.Material) => {
      add(root, "box", M.darkMetal, [x, yy + 2.1, zFront + 0.3], [0.25, 4.2, 0.25], true);
      add(root, "box", M.darkMetal, [x, yy + 2.1, zBack - 0.3], [0.25, 4.2, 0.25], true);
      add(root, "box", banner, [x, yy + 4.1, zMid], [0.2, 0.7, depth + 0.6]);
      const sm = mat({ color: "#000", emissiveMap: tex(device, signCanvas(label, "#ffd23f"), false), emissiveIntensity: 1.3, noEnv: true });
      facades.push(sm);
      add(root, "plane", sm, [x, yy + 4.95, zFront + 0.3], [3.2, 1, 0.8], false, [90, 0, 0]);
    };
    arch(0, 0, "START", M.white);
    const fy = c.segments[c.segments.length - 1]!.y;
    const finMat = mat({ map: finishTex, tiling: [1, 1], gloss: 0.3 });
    facades.push(finMat);
    arch(c.length, fy, "FINISH", finMat);
    add(root, "box", finMat, [c.length, fy + 0.012, zMid], [0.5, 0.02, depth - 0.5]);
  };

  // Runners.
  const humans: Humanoid[] = [];
  const anims: ParkourAnimator[] = [];
  const blobs: pc.Entity[] = [];
  const trails: pc.Entity[] = [];
  const runnerRoot = new pc.Entity("runners");
  app.root.addChild(runnerRoot);
  let lastList: { avatar: AvatarConfig | null; color: string }[] = [];
  const setupRunners = (n: number) => {
    humans.forEach((h) => h.destroy());
    blobs.forEach((b) => b.destroy());
    trails.forEach((b) => b.destroy());
    humans.length = anims.length = blobs.length = trails.length = 0;
    for (let i = 0; i < n; i++) {
      const h = createHumanoid(runnerRoot, null, { shadows: true, detail: quality === "high" ? "full" : "simple" });
      h.root.setLocalEulerAngles(0, -90, 0); // face +x
      humans.push(h);
      anims.push(new ParkourAnimator(h));
      blobs.push(add(runnerRoot, "cylinder", M.shadow, [0, 0.03, 0], [0.8, 0.01, 0.5]));
      const tr = add(runnerRoot, "box", M.trail, [0, 1, 0], [2.4, 1.1, 0.25]);
      tr.enabled = false;
      trails.push(tr);
    }
    lastList.forEach((r, i) => humans[i]?.apply(r.avatar));
  };

  // Particles: dust and sparks (pooled).
  const parts: { e: pc.Entity; life: number; max: number; vx: number; vy: number; vz: number; grow: number }[] = [];
  const pool = (m: pc.Material, n: number) => {
    for (let k = 0; k < n; k++) {
      const e = add(app.root, "sphere", m, [0, -100, 0], [0.2, 0.2, 0.2]);
      parts.push({ e, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0 });
    }
  };
  pool(M.dust, 40);
  const dustN = 40;
  pool(M.spark, 40);
  const emit = (spark: boolean, x: number, y: number, z: number, n: number) => {
    let made = 0;
    for (let k = spark ? dustN : 0; k < (spark ? parts.length : dustN) && made < n; k++) {
      const p = parts[k]!;
      if (p.life > 0) continue;
      p.life = p.max = spark ? 0.6 : 0.7;
      p.vx = spark ? (Math.random() - 0.5) * 6 : -1 - Math.random() * 2;
      p.vy = spark ? 2 + Math.random() * 4 : 0.5 + Math.random();
      p.vz = (Math.random() - 0.5) * (spark ? 6 : 2);
      p.grow = spark ? -0.2 : 0.9;
      p.e.setPosition(x, y, z);
      p.e.setLocalScale(spark ? 0.12 : 0.25, spark ? 0.12 : 0.25, spark ? 0.12 : 0.25);
      made++;
    }
  };

  const camera = new pc.Entity("camera");
  camera.addComponent("camera", { fov: 50, nearClip: 0.1, farClip: 1600, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB });
  app.root.addChild(camera);
  const camPos = new pc.Vec3(-6, 3, 12), camLook = new pc.Vec3(0, 1, 0);
  const want = new pc.Vec3(), wantLook = new pc.Vec3();
  let state: RaceState | null = null;
  let viewer = 0;
  let celebrate: number[] = [];
  let elapsed = 0;
  const laneOf = (i: number) => (i === viewer ? 0 : i < viewer ? i + 1 : i);

  app.on("update", (dt: number) => {
    elapsed += dt;
    blink.forEach((b, k) => (b.enabled = Math.sin(elapsed * 3 + k) > 0.2));
    signs.forEach((s) => {
      const f = Math.sin(elapsed * 23 + s.ph) > 0.97 ? 0.3 : 1.4;
      if (Math.abs(s.m.emissiveIntensity - f) > 0.01) {
        s.m.emissiveIntensity = f;
        s.m.update();
      }
    });
    for (const p of parts) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const q = p.e.getPosition();
      p.vy -= (p.grow < 0 ? 9 : 1) * dt;
      p.e.setPosition(q.x + p.vx * dt, q.y + p.vy * dt, q.z + p.vz * dt);
      const sc = p.e.getLocalScale().x * (1 + p.grow * dt);
      p.e.setLocalScale(sc, sc, sc);
      if (p.life <= 0) p.e.setPosition(0, -100, 0);
    }
    const s = state;
    if (!s || !course) return;
    const portrait = cv.clientHeight > cv.clientWidth * 1.05;
    s.runners.forEach((a, i) => {
      const h = humans[i];
      if (!h) return;
      const z = -laneOf(i) * LANE_GAP;
      h.root.setPosition(a.x, a.y, z);
      anims[i]!.update(a, dt, celebrate[i] ?? 0, s.phase === "ready" && s.goAt - s.t < 1.2);
      const gy = groundY(a.x);
      const b = blobs[i]!;
      if (gy !== null && a.state !== "fall") {
        b.enabled = true;
        const hgt = Math.max(0, a.y - gy);
        b.setPosition(a.x, gy + 0.02, z);
        const sc = Math.max(0.3, 1 - hgt * 0.25);
        b.setLocalScale(0.8 * sc, 0.01, 0.5 * sc);
      } else b.enabled = false;
      const tr = trails[i]!;
      tr.enabled = a.boost > 0.6 && a.state !== "fall";
      if (tr.enabled) {
        tr.setPosition(a.x - 1.3, a.y + (a.state === "slide" ? 0.35 : 1.0), z);
        tr.setLocalScale(1.6 + a.boost * 0.6, a.state === "slide" ? 0.5 : 1.1, 0.2);
      }
    });

    // Chase camera: side-on, a little ahead; portrait pulls back and up to show more course.
    const me = s.runners[viewer];
    if (me) {
      const ahead = portrait ? 4.5 : 5.5;
      const back = portrait ? 15 : 10.5;
      const lift = portrait ? 4.2 : 2.6;
      const gy = groundY(me.x + 6) ?? me.y;
      const focusY = Math.max(me.state === "fall" ? me.y * 0.4 + gy * 0.6 : me.y, (me.y + gy) / 2);
      if (s.phase === "ready") {
        want.set(me.x + 4, me.y + 1.6, 6.5);
        wantLook.set(me.x + 0.5, me.y + 1, -LANE_GAP);
      } else if (me.state === "done" && me.vx < 2) {
        want.set(me.x + 4, me.y + 1.8, 6);
        wantLook.set(me.x, me.y + 1, -LANE_GAP * 0.5);
      } else {
        want.set(me.x + ahead * 0.35, focusY + lift, back);
        wantLook.set(me.x + ahead, focusY + 1.1, -LANE_GAP * (lanes - 1) * 0.35);
      }
      const k = 1 - Math.exp(-dt * (s.phase === "ready" ? 2.5 : 6));
      camPos.x += (want.x - camPos.x) * Math.min(1, k * 1.6);
      camPos.y += (want.y - camPos.y) * k * 0.8;
      camPos.z += (want.z - camPos.z) * k;
      camLook.x += (wantLook.x - camLook.x) * Math.min(1, k * 1.6);
      camLook.y += (wantLook.y - camLook.y) * k * 0.8;
      camLook.z += (wantLook.z - camLook.z) * k;
      camera.setPosition(camPos);
      camera.lookAt(camLook);
      const speedFov = Math.min(1, (me.vx + me.boost) / 11) * 6;
      camera.camera!.fov = (portrait ? 62 : 48) + speedFov;
      sky.setPosition(camPos.x, 0, camPos.z);
      sunDisc.setPosition(camPos.x + 220, 55, camPos.z - 560);
    }
  });

  const groundY = (x: number) => {
    if (!course) return null;
    for (const sg of course.segments) if (x >= sg.x0 && x <= sg.x1) return sg.y;
    return null;
  };

  const resize = () => {
    const rect = cv.parentElement?.getBoundingClientRect();
    if (rect) app.resizeCanvas(Math.max(1, rect.width), Math.max(1, rect.height));
  };
  const ro = new ResizeObserver(resize);
  if (cv.parentElement) ro.observe(cv.parentElement);
  resize();
  app.start();

  return {
    setCourse(c, count) {
      course = c;
      lanes = count;
      build();
      if (humans.length !== count) setupRunners(count);
    },
    setRunners(list) {
      lastList = list;
      if (humans.length !== list.length) setupRunners(list.length);
      list.forEach((r, i) => humans[i]!.apply(r.avatar));
    },
    setState(s, v, c) {
      state = s;
      viewer = v;
      celebrate = c;
    },
    fx(kind, i) {
      const a = state?.runners[i];
      if (!a) return;
      const z = -laneOf(i) * LANE_GAP;
      if (kind === "land") emit(false, a.x, a.y + 0.1, z, 6);
      else if (kind === "hit") emit(false, a.x + 0.3, a.y + 0.6, z, 8);
      else if (kind === "perfect") {
        emit(true, a.x, a.y + 1.2, z, 14);
        if (a.state === "air") anims[i]?.trick();
      } else if (kind === "pad") emit(true, a.x, a.y + 0.2, z, 10);
      else if (kind === "finish") emit(true, a.x, a.y + 2.5, z, 30);
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      device.maxPixelRatio = ratio();
      build();
      if (course) setupRunners(lanes);
      resize();
    },
    destroy() {
      ro.disconnect();
      app.destroy();
    },
  };
}
