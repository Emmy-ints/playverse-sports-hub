/**
 * Rooftop Rush renderer (PlayCanvas): golden-hour city with layered skyline and lit windows,
 * rooftops with gravel, parapets, water towers, antennas and neon billboards; the course's vents,
 * pipes, gaps, walls and speed pads; start and finish arches; runners with dust, speed trails and
 * sparkles; and a side-on chase camera that frames the action on landscape and portrait screens.
 */
import * as pc from "playcanvas";
import type { AvatarConfig } from "@/lib/avatar";
import { createHumanoid, type Humanoid } from "../character/humanoid.ts";
import { RealisticRig } from "../character/mirror.ts";
import { ParkourAnimator } from "./anim.ts";
import { getGameSettings, camLiveliness } from "@/lib/game-settings";
import { LANE_W, laneZ, RUN_SPEED, type Course, type RaceState, type Runner } from "./sim.ts";
import type { GhostPose } from "./ghost.ts";

export type Quality = "high" | "low";

export interface ParkourView {
  setCourse(c: Course, count: number): void;
  setRunners(list: { avatar: AvatarConfig | null; color: string }[]): void;
  setState(s: RaceState, viewer: number, celebrate: number[]): void;
  fx(kind: "perfect" | "pad" | "land" | "hit" | "finish", i: number): void;
  setQuality(q: Quality): void;
  /** Translucent personal-best runner (null hides it). */
  setGhost(pose: GhostPose | null): void;
  destroy(): void;
}

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse || small ? "low" : "high";
}


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
  sun.lookAt(new pc.Vec3(-0.8, -0.38, -0.25).normalize());
  sun.rotateLocal(90, 0, 0);
  app.root.addChild(sun);
  const rim = new pc.Entity("rim");
  // Fill from behind the camera so runners' backs aren't silhouettes against the sunset.
  rim.addComponent("light", { type: "directional", color: new pc.Color(0.7, 0.75, 1), intensity: 0.95, castShadows: false });
  rim.lookAt(new pc.Vec3(0.75, -0.45, 0.3).normalize());
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
    grip: mat({ color: "#2a2000", emissive: "#ffd23f", emissiveIntensity: 0.8 }),
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
  /** Course half-width (lanes plus run-off) and building half-width (room for rooftop decor). */
  const HALF = LANE_W * 1.5 + 1.4;
  const BLD = 8.5;

  /** A plane facing the approaching camera (-x). */
  const facingPlane = (root: pc.Entity, m: pc.Material, pos: [number, number, number], w: number, h: number) => {
    const p = new pc.Entity();
    p.setLocalPosition(...pos);
    p.setLocalEulerAngles(0, -90, 0);
    root.addChild(p);
    add(p, "plane", m, [0, 0, 0], [w, 1, h], false, [90, 0, 0]);
    return p;
  };

  /** City around the course: skyline blocks down both sides and beyond the finish. */
  const buildSkyline = (root: pc.Entity, from: number, to: number) => {
    const r = rand(99);
    const layers = quality === "high" ? [[22, 1.0], [55, 0.75], [110, 0.5]] : [[26, 0.9], [90, 0.55]];
    layers.forEach(([dz, shade], li) => {
      const base = `rgb(${Math.round(40 * shade!)},${Math.round(38 * shade!)},${Math.round(62 * shade!)})`;
      const m = mat({ map: tex(device, windowsCanvas(base, 0.3, 50 + li)), emissiveMap: tex(device, windowsEmissive(0.3 * shade!, 50 + li)), tiling: [3, 6], gloss: 0.1 });
      for (const side of [-1, 1]) {
        let x = from - 60;
        while (x < to + 160) {
          const w = 10 + r() * 18;
          const h = 14 + r() * (34 + li * 40);
          const z = side * (dz! + r() * 18);
          add(root, "box", m, [x + w / 2, h / 2 - 40, z], [w, h + 40, 10 + r() * 14]);
          if (r() < 0.25) {
            const a = add(root, "cylinder", M.darkMetal, [x + w / 2, h - 40 + 4 + 40 / 2 - 20, z], [0.4, 8, 0.4]);
            blink.push(add(a, "sphere", M.red, [0, 0.52, 0], [3.5, 0.12, 3.5]));
          }
          x += w + 2 + r() * 8;
        }
      }
    });
    // A wall of towers far beyond the finish, under the sun.
    const fm = mat({ map: tex(device, windowsCanvas("#2a2640", 0.25, 77)), emissiveMap: tex(device, windowsEmissive(0.25, 77)), tiling: [3, 6], gloss: 0.1 });
    for (let z = -160; z < 160; z += 14 + r() * 10) {
      const h = 30 + r() * 70;
      add(root, "box", fm, [to + 150 + r() * 60, h / 2 - 40, z], [16, h + 40, 12]);
    }
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
    buildSkyline(root, -30, c.length + 40);
    const r = rand(c.seed + 3);
    const laneLine = mat({ color: "#e9e4dc", opacity: 0.35, noEnv: true });
    facades.push(laneLine);
    c.segments.forEach((sg, k) => {
      const w = sg.x1 - sg.x0;
      const h = sg.y + 40;
      const cx = (sg.x0 + sg.x1) / 2;
      add(root, "box", facadeMat(k, w, h), [cx, sg.y - h / 2, 0], [w, h, BLD * 2], false);
      const rm = mat({ map: tex(device, noise(["#6f6a66", "#6a6560", "#76706a"][k % 3]!, 46, 256, k + 3)), tiling: [w / 4, BLD / 2], gloss: 0.12 });
      facades.push(rm);
      // Roof surface sits just above the building's top face (no z-fighting with the facade texture).
      add(root, "box", rm, [cx, sg.y - 0.035, 0], [w + 0.02, 0.1, BLD * 2 + 0.02], false);
      // Painted lane lines, so steering is easy to read.
      for (const lz of [-LANE_W / 2, LANE_W / 2]) add(root, "box", laneLine, [cx, sg.y + 0.025, lz], [w, 0.01, 0.07]);
      // Low parapets along both edges of the course.
      for (const side of [-1, 1]) add(root, "box", M.parapet, [cx, sg.y + 0.3, side * (HALF + 0.2)], [w, 0.6, 0.3], true);
      // Rooftop decor outside the parapets.
      let x = sg.x0 + 4;
      while (x < sg.x1 - 4) {
        const pickD = r();
        const side = r() < 0.5 ? -1 : 1;
        const z = side * (HALF + 2.2 + r() * 1.6);
        if (pickD < 0.2) {
          const tw = new pc.Entity();
          tw.setLocalPosition(x, sg.y, z);
          root.addChild(tw);
          for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(tw, "box", M.darkMetal, [dx * 1.1, 1.8, dz * 1.1], [0.15, 3.6, 0.15]);
          add(tw, "cylinder", M.tank, [0, 4.6, 0], [3, 2.6, 3], true);
          add(tw, "cone", M.tank, [0, 6.3, 0], [3.2, 0.9, 3.2]);
        } else if (pickD < 0.4) {
          const text = ["PLAYVERSE", "ROOFTOP RUSH", "GO FASTER", "NO LIMITS", "CITY RUN"][Math.floor(r() * 5)]!;
          const colr = ["#ff3fb4", "#3ef0ff", "#ffd23f", "#7cff6b"][Math.floor(r() * 4)]!;
          const sm = mat({ color: "#000", emissiveMap: tex(device, signCanvas(text, colr), false), emissiveIntensity: 1.4, noEnv: true });
          facades.push(sm);
          for (const dz of [-1.6, 1.6]) add(root, "box", M.darkMetal, [x + 0.2, sg.y + 1.8, z + dz], [0.15, 3.6, 0.15]);
          const p = facingPlane(root, sm, [x, sg.y + 4, z], 4.2, 1.05);
          signs.push({ e: p, m: sm, ph: r() * 10 });
        } else if (pickD < 0.6) {
          add(root, "box", M.metal, [x, sg.y + 0.7, z], [1.6, 1.4, 2.2], true);
          add(root, "cylinder", M.darkMetal, [x, sg.y + 1.45, z], [1.2, 0.1, 1.2]);
        } else if (pickD < 0.72) {
          const a = add(root, "cylinder", M.darkMetal, [x, sg.y + 3, z], [0.12, 6, 0.12]);
          blink.push(add(a, "sphere", M.red, [0, 0.52, 0], [2.5, 0.05, 2.5]));
        }
        x += 5 + r() * 6;
      }
      if (quality === "high" && w > 12) {
        for (const side of [-1, 1]) for (let lx = sg.x0 + 1; lx < sg.x1 - 1; lx += 1.8) add(root, "sphere", M.bulb, [lx, sg.y + 0.75, side * (HALF + 0.2)], [0.1, 0.1, 0.1]);
      }
    });
    add(root, "box", M.alley, [c.length / 2, -40, 0], [c.length + 300, 1, 80]);

    const laneSpan = (mask: number) => {
      const ls = [0, 1, 2].filter((l) => mask & (1 << l));
      const runs: number[][] = [];
      for (const l of ls) {
        const last = runs[runs.length - 1];
        if (last && last[last.length - 1] === l - 1) last.push(l);
        else runs.push([l]);
      }
      return runs.map((run) => ({ z: (laneZ(run[0]!) + laneZ(run[run.length - 1]!)) / 2, w: run.length * LANE_W }));
    };
    c.obstacles.forEach((o) => {
      if (o.kind === "vent") {
        for (let l = 0; l < 3; l++) {
          if (!(o.lanes & (1 << l))) continue;
          const z = laneZ(l);
          add(root, "box", M.grille, [o.x + o.w / 2, o.y + o.h / 2, z], [o.w, o.h, LANE_W - 0.25], true);
          add(root, "box", M.metal, [o.x + o.w / 2, o.y + o.h + 0.03, z], [o.w + 0.08, 0.06, LANE_W - 0.15]);
          add(root, "cylinder", M.darkMetal, [o.x + o.w / 2, o.y + o.h + 0.07, z], [Math.min(0.7, o.w * 0.8), 0.04, 0.7]);
        }
      } else if (o.kind === "rail") {
        const span = HALF * 2 - 0.4;
        add(root, "cylinder", M.metal, [o.x + 0.1, o.y + o.h, 0], [0.1, span, 0.1], true, [90, 0, 0]);
        add(root, "cylinder", M.metal, [o.x + 0.1, o.y + o.h * 0.55, 0], [0.07, span, 0.07], false, [90, 0, 0]);
        for (let z = -span / 2; z <= span / 2 + 0.01; z += span / 4) add(root, "box", M.darkMetal, [o.x + 0.1, o.y + o.h / 2, z], [0.08, o.h, 0.08], true);
      } else if (o.kind === "pipe") {
        const top = o.y + o.h;
        for (const sp of laneSpan(o.lanes)) {
          add(root, "cylinder", M.pipe, [o.x + o.w / 2, top + 0.22, sp.z], [0.44, sp.w, 0.44], true, [90, 0, 0]);
          if (o.w > 1) add(root, "cylinder", M.pipe, [o.x + o.w / 2, top + 0.62, sp.z], [0.3, sp.w, 0.3], true, [90, 0, 0]);
          add(root, "box", M.stripe, [o.x - 0.02, top + 0.22, sp.z], [0.04, 0.3, sp.w * 0.9]);
          for (const ez of [sp.z - sp.w / 2, sp.z + sp.w / 2]) add(root, "box", M.darkMetal, [o.x + o.w / 2, o.y + (top - o.y + 0.5) / 2, ez], [0.14, top - o.y + 0.5, 0.14], true);
        }
      } else if (o.kind === "pad") {
        for (let l = 0; l < 3; l++) if (o.lanes & (1 << l)) add(root, "box", padMat, [o.x + o.w / 2, o.y + 0.02, laneZ(l)], [o.w, 0.04, LANE_W - 0.3]);
      } else if (o.kind === "gap" || o.kind === "drop") {
        add(root, "box", M.stripe, [o.x - 0.15, o.y + 0.01, 0], [0.3, 0.02, HALF * 2], false);
      } else if (o.kind === "swing") {
        // A swing bar over the gap: grab it and fly across.
        add(root, "box", M.stripe, [o.x - 0.15, o.y + 0.01, 0], [0.3, 0.02, HALF * 2], false);
        const barY = o.y + 2.55;
        add(root, "cylinder", M.metal, [o.x + 0.35, barY, 0], [0.12, HALF * 2, 0.12], true, [90, 0, 0]);
        for (let l = 0; l < 3; l++) add(root, "cylinder", M.grip, [o.x + 0.35, barY, laneZ(l)], [0.16, 0.7, 0.16], false, [90, 0, 0]);
        for (const side of [-1, 1]) {
          add(root, "box", M.darkMetal, [o.x - 0.2, o.y + 1.4, side * (HALF - 0.1)], [0.16, 2.8, 0.16], true);
          add(root, "box", M.darkMetal, [o.x + 0.08, barY + 0.1, side * (HALF - 0.1)], [0.7, 0.12, 0.12]);
        }
      } else if (o.kind === "wall") {
        add(root, "box", M.metal, [o.x + 0.05, o.y + o.h + 0.04, 0], [0.12, 0.08, BLD * 2]);
        for (let l = 0; l < 3; l++) add(root, "box", M.stripe, [o.x - 0.02, o.y + 0.8, laneZ(l)], [0.04, 0.25, LANE_W - 0.4]);
      }
    });

    // Start and finish arches across the course, facing the runners.
    const arch = (x: number, yy: number, label: string, banner: pc.Material) => {
      for (const side of [-1, 1]) add(root, "box", M.darkMetal, [x, yy + 2.3, side * (HALF + 0.5)], [0.25, 4.6, 0.25], true);
      add(root, "box", banner, [x, yy + 4.5, 0], [0.2, 0.7, HALF * 2 + 1.2]);
      const sm = mat({ color: "#000", emissiveMap: tex(device, signCanvas(label, "#ffd23f"), false), emissiveIntensity: 1.3, noEnv: true });
      facades.push(sm);
      facingPlane(root, sm, [x - 0.12, yy + 5.3, 0], 4, 1);
    };
    arch(0, 0, "START", M.white);
    const fy = c.segments[c.segments.length - 1]!.y;
    const finMat = mat({ map: finishTex, tiling: [1, 1], gloss: 0.3 });
    facades.push(finMat);
    arch(c.length, fy, "FINISH", finMat);
    add(root, "box", finMat, [c.length, fy + 0.012, 0], [0.5, 0.02, HALF * 2]);
  };

  // Runners.
  const humans: Humanoid[] = [];
  const anims: ParkourAnimator[] = [];
  const rigs: RealisticRig[] = [];
  const blobs: pc.Entity[] = [];
  const trails: pc.Entity[] = [];
  const runnerRoot = new pc.Entity("runners");
  app.root.addChild(runnerRoot);
  let lastList: { avatar: AvatarConfig | null; color: string }[] = [];
  const setupRunners = (n: number) => {
    rigs.forEach((r) => r.destroy());
    humans.forEach((h) => h.destroy());
    blobs.forEach((b) => b.destroy());
    trails.forEach((b) => b.destroy());
    humans.length = anims.length = blobs.length = trails.length = rigs.length = 0;
    for (let i = 0; i < n; i++) {
      const h = createHumanoid(runnerRoot, null, { shadows: true, detail: quality === "high" ? "full" : "simple" });
      h.root.setLocalEulerAngles(0, -90, 0); // face +x
      humans.push(h);
      rigs.push(new RealisticRig(app, h, lastList[i]?.avatar ?? null, { grip: [0.3, 0.3] }));
      anims.push(new ParkourAnimator(h));
      blobs.push(add(runnerRoot, "cylinder", M.shadow, [0, 0.03, 0], [0.6, 0.01, 0.8]));
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
  camera.addComponent("camera", { fov: 62, nearClip: 0.1, farClip: 1600, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB });
  app.root.addChild(camera);
  const camPos = new pc.Vec3(8, 3, 6), camLook = new pc.Vec3(0, 1, 0);
  const want = new pc.Vec3(), wantLook = new pc.Vec3();
  let state: RaceState | null = null;
  let ghost: { h: Humanoid; anim: ParkourAnimator; last: number } | null = null;
  let ghostPose: GhostPose | null = null;
  const ghostMat = new pc.StandardMaterial();
  ghostMat.diffuse = new pc.Color(0.35, 0.85, 1);
  ghostMat.emissive = new pc.Color(0.2, 0.55, 0.85);
  ghostMat.opacity = 0.35;
  ghostMat.blendType = pc.BLEND_NORMAL;
  ghostMat.depthWrite = false;
  ghostMat.update();
  let viewer = 0;
  let celebrate: number[] = [];
  let elapsed = 0;
  let focusY = 0;
  let fovNow = 62;
  /** Visual-only spacing so runners sharing a lane don't overlap. */
  const vis = (i: number) => (i === viewer ? 0 : ((i % 2 ? 1 : -1) * 0.22));

  const groundY = (x: number) => {
    if (!course) return null;
    for (const sg of course.segments) if (x >= sg.x0 && x <= sg.x1) return sg.y;
    return null;
  };

  /** Lowest safe camera height at x: above the roof below it, and above any wall face between it and the runner. */
  const camFloor = (cx: number, rx: number) => {
    let min = (groundY(cx) ?? -40) + 1.4;
    if (course) for (const o of course.obstacles) if (o.kind === "wall" && o.x > cx && o.x < rx + 0.5) min = Math.max(min, o.y + o.h + 0.9);
    return min;
  };

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
    if (ghost) {
      ghost.h.root.enabled = !!ghostPose;
      if (ghostPose) {
        ghost.h.root.setPosition(ghostPose.x, ghostPose.y, ghostPose.z);
        ghost.anim.update(ghostPose as unknown as Runner, dt, 0, false);
      }
    }
    const portrait = cv.clientHeight > cv.clientWidth * 1.05;
    const settings = getGameSettings();
    const live = camLiveliness(settings);
    s.runners.forEach((a, i) => {
      const h = humans[i];
      if (!h) return;
      const z = a.z + vis(i);
      h.root.setPosition(a.x, a.y, z);
      anims[i]!.update(a, dt, celebrate[i] ?? 0, s.phase === "ready" && s.goAt - s.t < 1.2);
      rigs[i]?.update();
      const gy = groundY(a.x);
      const b = blobs[i]!;
      if (gy !== null && a.state !== "fall" && a.y - gy < 6) {
        b.enabled = true;
        const hgt = Math.max(0, a.y - gy);
        b.setPosition(a.x, gy + 0.02, z);
        const sc = Math.max(0.3, 1 - hgt * 0.25);
        b.setLocalScale(0.6 * sc, 0.01, 0.8 * sc);
      } else b.enabled = false;
      const tr = trails[i]!;
      tr.enabled = a.boost > 0.6 && a.state !== "fall" && a.state !== "swing";
      if (tr.enabled) {
        const low = a.state === "slide" || a.state === "roll";
        tr.setPosition(a.x - 1.3, a.y + (low ? 0.35 : 1.0), z);
        tr.setLocalScale(1.6 + a.boost * 0.6, low ? 0.5 : 1.1, 0.2);
      }
    });

    // Chase camera: behind and above the runner, looking ahead down the course.
    const me = s.runners[viewer];
    if (me) {
      const gy = groundY(me.x) ?? me.y;
      // Follow height gently through jumps (no bobbing), firmly through climbs and drops.
      const wantFocus = me.state === "air" ? Math.max(gy, me.y * 0.45 + Math.max(gy, me.peakY - 1.2) * 0.55) : me.state === "fall" ? me.y * 0.3 + gy * 0.7 : me.y;
      focusY += (wantFocus - focusY) * (1 - Math.exp(-dt * (me.state === "air" ? 3.5 : 7)));
      if (s.phase === "ready") {
        // Pre-race: in front of the line looking back at the runners.
        want.set(me.x + 4.2, me.y + 1.7, me.z + 2.2);
        wantLook.set(me.x - 0.5, me.y + 1.1, me.z * 0.5);
      } else if (me.state === "done" && me.vx < 2.5) {
        want.set(me.x + 3.6, me.y + 1.9, me.z + 2.6);
        wantLook.set(me.x, me.y + 1.1, me.z);
      } else {
        const speed = me.vx + me.boost;
        const pull = live * Math.max(0, Math.min(1.8, (speed - RUN_SPEED) * 0.45)) + (me.state === "swing" ? 1.6 : 0) + (me.state === "air" && me.y - gy > 1.5 ? 0.8 : 0);
        const back = (portrait ? 6.4 : 5.2) + pull;
        const up = (portrait ? 3.6 : 2.5) + (me.state === "climb" ? 0.9 : 0) + (me.state === "swing" ? 0.6 : 0);
        const ahead = 6 + live * Math.min(3, speed * 0.25);
        want.set(me.x - back, focusY + up, me.z * 0.55);
        wantLook.set(me.x + ahead, focusY + 1.1, me.z * 0.75);
      }
      const k = 1 - Math.exp(-dt * (s.phase === "ready" ? 2.6 : 7));
      // x is followed tightly so the runner never leaves the frame; height and side gently.
      camPos.x += (want.x - camPos.x) * (s.phase === "live" && me.state !== "done" ? 1 - Math.exp(-dt * 14) : k);
      camPos.y += (want.y - camPos.y) * k * 0.85;
      camPos.z += (want.z - camPos.z) * k * 0.8;
      camLook.x += (wantLook.x - camLook.x) * Math.min(1, k * 1.6);
      camLook.y += (wantLook.y - camLook.y) * k;
      camLook.z += (wantLook.z - camLook.z) * k * 0.8;
      // Collision avoidance: never inside a building or below a roof between us and the runner.
      if (s.phase === "live") camPos.y = Math.max(camPos.y, camFloor(camPos.x, me.x));
      camera.setPosition(camPos);
      camera.lookAt(camLook);
      const kick = settings.camMode === "steady" ? 0 : Math.min(1, Math.max(0, (me.vx + me.boost - 7) / 4)) * 8;
      fovNow += ((portrait ? 72 : 62) + kick - fovNow) * (1 - Math.exp(-dt * 3));
      camera.camera!.fov = fovNow;
      sky.setPosition(camPos.x, 0, camPos.z);
      sunDisc.setPosition(camPos.x + 520, 48, camPos.z + 140);
    }
  });

  // Debug handle (read-only use from the console): window.__playverseParkour
  if (typeof window !== "undefined") (window as unknown as Record<string, unknown>).__playverseParkour = { app, camera, camPos, camLook, get state() { return state; } };

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
      list.forEach((r, i) => {
        humans[i]!.apply(r.avatar);
        rigs[i]?.setLook(r.avatar);
      });
    },
    setState(s, v, c) {
      state = s;
      viewer = v;
      celebrate = c;
    },
    fx(kind, i) {
      const a = state?.runners[i];
      if (!a) return;
      const z = a.z + vis(i);
      if (kind === "land") emit(false, a.x, a.y + 0.1, z, 6);
      else if (kind === "hit") emit(false, a.x + 0.3, a.y + 0.6, z, 8);
      else if (kind === "perfect") {
        emit(true, a.x, a.y + 1.2, z, 14);
        if (a.state === "air" && !a.vaulting) anims[i]?.trick();
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
    setGhost(pose) {
      ghostPose = pose;
      if (pose && !ghost) {
        const h = createHumanoid(runnerRoot, null, { shadows: false, detail: "simple" });
        h.root.setLocalEulerAngles(0, -90, 0);
        for (const r of h.root.findComponents("render") as pc.RenderComponent[]) {
          r.castShadows = false;
          for (const mi of r.meshInstances) mi.material = ghostMat;
        }
        ghost = { h, anim: new ParkourAnimator(h), last: 0 };
      }
    },
    destroy() {
      rigs.forEach((r) => r.destroy());
      ro.disconnect();
      app.destroy();
    },
  };
}
