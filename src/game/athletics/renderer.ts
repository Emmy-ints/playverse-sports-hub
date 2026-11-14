/**
 * PlayCanvas athletics stadium: full 400 m-style oval with an 8-lane tartan track, lane lines and
 * numbers, start and finish lines, striped infield, long-jump runways and sand pit, javelin runways
 * and sector, hurdles, grandstand with roof and thousands of spectators, floodlight towers, giant
 * screen and finish-line clock, real-photo sky — plus the athletes and broadcast cameras.
 */
import * as pc from "playcanvas";
import { camLiveliness } from "@/lib/game-settings";
import type { AvatarConfig } from "@/lib/avatar";
import { Crowd } from "../bowling/crowd.ts";
import { createHumanoid, type Humanoid } from "../character/humanoid.ts";
import { RealisticRig } from "../character/mirror.ts";
import { loadAthleteAssets } from "../character/athlete.ts";
import { RealCrowd, bakeCrowdAtlas, type CrowdAtlas } from "../character/real-crowd.ts";
import { getGameSettings } from "@/lib/game-settings";
import { AthleteAnimator } from "./anim.ts";
import { PV, EVENTS, HURDLES, type EventId, type EventState } from "./sim.ts";

export type Quality = "high" | "low";

export interface AthleticsView {
  setEvent(event: EventId, count: number): void;
  setState(s: EventState, viewer: number, celebrate: number[]): void;
  setAthletes(list: { avatar: AvatarConfig | null; bib: string }[]): void;
  setBoard(title: string, lines: string[]): void;
  cheer(level: number): void;
  setQuality(q: Quality): void;
  destroy(): void;
}

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse || small ? "low" : "high";
}

const LANE_W = 1.22;
const R0 = 36.5; // inner radius of the bends
const W = LANE_W * 8;
const STRAIGHT_FROM = -15, STRAIGHT_TO = 105;

/** World position for an athlete's simulated x in an event, and the lane/runway z. */
export function worldOf(event: EventId, simX: number, i: number) {
  switch (event) {
    case "sprint100": return { x: simX, z: LANE_W * (i + 0.5) };
    case "hurdles110": return { x: simX - 10, z: LANE_W * (i + 0.5) };
    case "longjump": return { x: 62 + simX, z: -6 - i * 2.2 };
    case "javelin": return { x: 6 + simX, z: -30 - i * 2.6 };
    case "polevault": return { x: 90 + simX, z: -56 - i * 2 };
  }
}

function col(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}
function mat(o: { color?: string; gloss?: number; metal?: number; map?: pc.Texture; emissive?: string; emissiveMap?: pc.Texture; noEnv?: boolean; opacity?: number }) {
  const m = new pc.StandardMaterial();
  m.useMetalness = true;
  m.metalness = o.metal ?? 0;
  m.gloss = o.gloss ?? 0.3;
  if (o.color) m.diffuse = col(o.color);
  if (o.map) m.diffuseMap = o.map;
  if (o.emissive) m.emissive = col(o.emissive);
  if (o.emissiveMap) {
    m.emissiveMap = o.emissiveMap;
    m.emissive = new pc.Color(1, 1, 1);
  }
  if (o.opacity !== undefined) {
    m.opacity = o.opacity;
    m.blendType = pc.BLEND_NORMAL;
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
function noiseCanvas(base: string, amp: number, size = 256) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const img = ctx.getImageData(0, 0, size, size);
  let s = 7;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) >>> 0;
    const n = ((s / 4294967296) - 0.5) * amp;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n * 0.8));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n * 0.7));
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Point on the oval at distance offset `off` outward from the inner kerb, parameter u in [0,1). */
function ovalPath(off: number, n = 260): [number, number][] {
  const pts: [number, number][] = [];
  const L = STRAIGHT_TO - STRAIGHT_FROM, arc = Math.PI * (R0 + off);
  const total = 2 * L + 2 * arc;
  for (let k = 0; k < n; k++) {
    let d = (k / n) * total;
    if (d < L) { pts.push([STRAIGHT_FROM + d, off]); continue; }
    d -= L;
    if (d < arc) { const a = d / (R0 + off); pts.push([STRAIGHT_TO + Math.sin(a) * (R0 + off), -R0 + Math.cos(a) * (R0 + off)]); continue; }
    d -= arc;
    if (d < L) { pts.push([STRAIGHT_TO - d, -2 * R0 - off]); continue; }
    d -= L;
    const a = d / (R0 + off);
    pts.push([STRAIGHT_FROM - Math.sin(a) * (R0 + off), -R0 - Math.cos(a) * (R0 + off)]);
  }
  return pts;
}

function ringMesh(device: pc.GraphicsDevice, inner: [number, number][], outer: [number, number][], y: number, vScale: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const n = inner.length;
  let dist = 0;
  for (let k = 0; k <= n; k++) {
    const a = inner[k % n]!, b = outer[k % n]!;
    if (k > 0) dist += Math.hypot(a[0] - inner[k - 1]![0], a[1] - inner[k - 1]![1]);
    pos.push(a[0], y, a[1], b[0], y, b[1]);
    nor.push(0, 1, 0, 0, 1, 0);
    uv.push(0, dist * vScale, 1, dist * vScale);
  }
  for (let k = 0; k < n; k++) {
    const a = k * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, b, c, b, d, c);
  }
  const m = new pc.Mesh(device);
  m.setPositions(pos);
  m.setNormals(nor);
  m.setUvs(0, uv);
  m.setIndices(idx);
  m.update(pc.PRIMITIVE_TRIANGLES);
  return m;
}

export async function createAthleticsView(canvas: HTMLCanvasElement, initialQuality: Quality = detectQuality()): Promise<AthleticsView> {
  let quality = initialQuality;
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" } });
  const device = app.graphicsDevice;
  const ratio = () => (quality === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25));
  device.maxPixelRatio = ratio();
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.24, 0.25, 0.28);

  const envAsset = new pc.Asset("ath-sky", "texture", { url: "/assets/env/countryside.hdr" }, { mipmaps: false });
  app.assets.add(envAsset);
  envAsset.ready(() => {
    try {
      const t = envAsset.resource as pc.Texture;
      t.projection = pc.TEXTUREPROJECTION_EQUIRECT;
      app.scene.skybox = pc.EnvLighting.generateSkyboxCubemap(t);
      const lighting = pc.EnvLighting.generateLightingSource(t);
      app.scene.envAtlas = pc.EnvLighting.generateAtlas(lighting);
      lighting.destroy();
      app.scene.skyboxIntensity = 1;
    } catch (e) {
      console.warn("[athletics] sky unavailable", e);
    }
  });
  app.assets.load(envAsset);

  const shadowType = (pc as unknown as Record<string, number>)["SHADOW_PCF3_32F"] ?? (pc as unknown as Record<string, number>)["SHADOW_PCF3"] ?? 0;
  const sun = new pc.Entity("sun");
  sun.addComponent("light", { type: "directional", color: new pc.Color(1, 0.96, 0.88), intensity: 1.55, castShadows: true, shadowResolution: quality === "high" ? 2048 : 1024, shadowDistance: 70, numCascades: 1, shadowType, shadowBias: 0.3, normalOffsetBias: 0.05 });
  sun.lookAt(new pc.Vec3(0.35, -0.8, -0.45).normalize());
  sun.rotateLocal(90, 0, 0);
  app.root.addChild(sun);
  // Soft fill from the infield so the grandstand crowd under the roof is clearly lit.
  const fill = new pc.Entity("fill");
  fill.addComponent("light", { type: "directional", color: new pc.Color(1, 0.95, 0.88), intensity: 0.75, castShadows: false });
  fill.lookAt(new pc.Vec3(0.1, -0.35, 1).normalize());
  fill.rotateLocal(90, 0, 0);
  app.root.addChild(fill);

  const add = (parent: pc.Entity, type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], shadows = false, rot?: [number, number, number]) => {
    const e = new pc.Entity();
    e.addComponent("render", { type, material: m, castShadows: shadows, receiveShadows: true });
    e.setLocalPosition(...pos);
    e.setLocalScale(scale[0], type === "capsule" ? scale[1] / 2 : scale[1], scale[2]);
    if (rot) e.setLocalEulerAngles(...rot);
    parent.addChild(e);
    return e;
  };
  const meshE = (parent: pc.Entity, mesh: pc.Mesh, m: pc.Material) => {
    const e = new pc.Entity();
    e.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, m)], castShadows: false, receiveShadows: true });
    parent.addChild(e);
    return e;
  };

  const vaultMat = mat({ color: "#1f4fd1", gloss: 0.25 });
  const vaultMatTop = mat({ color: "#2a63ff", gloss: 0.3 });
  const M = {
    white: mat({ color: "#f4f4f2", gloss: 0.3 }),
    lineWhite: mat({ color: "#ffffff", gloss: 0.2, emissive: "#202020" }),
    sand: mat({ map: tex(device, noiseCanvas("#d9c08a", 40)), gloss: 0.1 }),
    runway: mat({ map: tex(device, noiseCanvas("#a8402e", 26)), gloss: 0.2 }),
    board: mat({ color: "#ffffff", gloss: 0.4 }),
    hurdleBar: mat({ color: "#f4f4f4", gloss: 0.5 }),
    hurdleStripe: mat({ color: "#111111", gloss: 0.5 }),
    hurdleLeg: mat({ color: "#2a2f3a", metal: 0.6, gloss: 0.6 }),
    javelin: mat({ color: "#d9dde3", metal: 0.9, gloss: 0.8 }),
    tip: mat({ color: "#1d2333", metal: 1, gloss: 0.8 }),
    concrete: mat({ color: "#8d929b", gloss: 0.15 }),
    roof: mat({ color: "#e8ecf2", metal: 0.4, gloss: 0.5 }),
    steel: mat({ color: "#3a404c", metal: 0.7, gloss: 0.6 }),
    lamp: mat({ color: "#ffffff", emissive: "#fff6dd" }),
    shadow: mat({ color: "#000000", opacity: 0.32, noEnv: true }),
  };

  let world: pc.Entity | null = null;
  const crowds: (Crowd | RealCrowd)[] = [];
  let atlas: CrowdAtlas | null = null;
  let dead = false;
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1024;
  boardCanvas.height = 512;
  const boardTex = tex(device, boardCanvas, false);
  const boardMat = mat({ color: "#000000", emissiveMap: boardTex, noEnv: true });
  const clockCanvas = document.createElement("canvas");
  clockCanvas.width = 256;
  clockCanvas.height = 64;
  const clockTex = tex(device, clockCanvas, false);
  const clockMat = mat({ color: "#000000", emissiveMap: clockTex, noEnv: true });

  const build = () => {
    world?.destroy();
    crowds.splice(0).forEach((c) => c.destroy());
    const root = new pc.Entity("stadium");
    app.root.addChild(root);
    world = root;
    // Infield grass with mowing stripes, surrounding apron.
    const grass = document.createElement("canvas");
    grass.width = 512;
    grass.height = 512;
    const g = grass.getContext("2d")!;
    for (let i = 0; i < 16; i++) {
      g.fillStyle = i % 2 ? "#4c8a37" : "#5a9a40";
      g.fillRect((i * 512) / 16, 0, 512 / 16, 512);
    }
    const grassTex = tex(device, grass);
    const grassMat = mat({ map: grassTex, gloss: 0.12 });
    grassMat.diffuseMapTiling = new pc.Vec2(1, 1);
    grassMat.update();
    add(root, "plane", grassMat, [(STRAIGHT_FROM + STRAIGHT_TO) / 2, 0, -R0], [STRAIGHT_TO - STRAIGHT_FROM + 2 * R0, 1, 2 * R0], false);
    add(root, "plane", mat({ color: "#56523f", gloss: 0.1, noEnv: true }), [(STRAIGHT_FROM + STRAIGHT_TO) / 2, -0.02, -R0], [420, 1, 320], false);
    // Tartan track ring.
    const tartan = tex(device, noiseCanvas("#b24a32", 30));
    const trackMat = mat({ map: tartan, gloss: 0.18 });
    trackMat.diffuseMapTiling = new pc.Vec2(3, 1);
    trackMat.update();
    const inner = ovalPath(0), outer = ovalPath(W + 1.2);
    meshE(root, ringMesh(device, inner, outer, 0.01, 0.25), trackMat);
    // Lane lines.
    for (let k = 0; k <= 8; k++) {
      const off = k * LANE_W;
      meshE(root, ringMesh(device, ovalPath(off - 0.025), ovalPath(off + 0.025), 0.02, 0.1), M.lineWhite);
    }
    // Start lines (100m at x=0, hurdles at x=-10) and finish line (x=100); lane numbers.
    for (const [x, w] of [[0, 0.05], [-10, 0.05], [100, 0.08]] as const) add(root, "box", M.lineWhite, [x, 0.022, W / 2], [w, 0.004, W], false);
    const numCanvas = document.createElement("canvas");
    numCanvas.width = 1024;
    numCanvas.height = 128;
    const nc = numCanvas.getContext("2d")!;
    nc.fillStyle = "rgba(0,0,0,0)";
    nc.clearRect(0, 0, 1024, 128);
    nc.font = "900 100px 'Saira Condensed', 'Arial Narrow', sans-serif";
    nc.textAlign = "center";
    nc.textBaseline = "middle";
    nc.fillStyle = "#ffffff";
    for (let i = 0; i < 8; i++) nc.fillText(String(i + 1), 64 + i * 128, 68);
    const numTex = tex(device, numCanvas, false);
    const numMat = mat({ map: numTex, gloss: 0.2 });
    numMat.opacityMap = numTex;
    numMat.opacityMapChannel = "a";
    numMat.alphaTest = 0.4;
    numMat.update();
    const numPlane = add(root, "plane", numMat, [102.5, 0.023, W / 2], [W, 1, 1.4], false, [0, 90, 0]);
    void numPlane;
    // Long jump runways + sand pit.
    for (let i = 0; i < 8; i++) {
      const z = -6 - i * 2.2;
      add(root, "box", M.runway, [62 - 21, 0.012, z], [44, 0.02, 1.22], false);
      add(root, "box", M.board, [62 - 0.1, 0.025, z], [0.2, 0.01, 1.22], false);
    }
    add(root, "box", M.sand, [62 + 5.5, 0.02, -6 - 3.5 * 2.2], [9.5, 0.04, 8 * 2.2 + 1], false);
    add(root, "box", M.concrete, [62 + 5.5, 0.03, -6 + 1.4], [10, 0.05, 0.3], false);
    add(root, "box", M.concrete, [62 + 5.5, 0.03, -6 - 7 * 2.2 - 1.4], [10, 0.05, 0.3], false);
    // Javelin runways and sector lines with distance arcs.
    for (let i = 0; i < 8; i++) {
      const z = -30 - i * 2.6;
      add(root, "box", M.runway, [6 - 17, 0.012, z], [34, 0.02, 1.2], false);
      add(root, "box", M.lineWhite, [6, 0.024, z], [0.07, 0.004, 1.2], false);
    }
    for (const d of [40, 50, 60, 70, 80]) add(root, "box", M.lineWhite, [6 + d, 0.02, -30 - 3.5 * 2.6], [0.06, 0.004, 8 * 2.6 + 6], false);
    // Pole vault: runways, plant boxes, one wide landing mat and the uprights (bar is set per attempt).
    for (let i = 0; i < 8; i++) {
      const z = -56 - i * 2;
      add(root, "box", M.runway, [90 - 18, 0.012, z], [36, 0.02, 1.1], false);
      add(root, "box", M.concrete, [90 - 0.4, 0.015, z], [0.8, 0.02, 0.6], false);
    }
    add(root, "box", vaultMat, [90 + 3.2, 0.4, -56 - 7], [5, 0.8, 17.5], true);
    add(root, "box", vaultMatTop, [90 + 3.2, 0.81, -56 - 7], [5, 0.02, 17.5], false);
    for (const z of [-56 + 1.6, -56 - 15.6]) add(root, "box", M.steel, [90 + 0.6, 3.5, z], [0.12, 7, 0.12], true);
    // Grandstand (home straight) with roof, back stand (back straight).
    const standX = (STRAIGHT_FROM + STRAIGHT_TO) / 2, standLen = STRAIGHT_TO - STRAIGHT_FROM + 20;
    const tiers = quality === "high" ? 7 : 4;
    add(root, "box", M.concrete, [standX, 0.5, W + 3.4], [standLen, 1, 1.2], false);
    add(root, "box", M.concrete, [standX, 3.2 + tiers * 0.2, W + 4.5 + tiers * 0.55], [standLen, 6 + tiers * 0.4, 0.6], false);
    add(root, "box", M.roof, [standX, 8 + tiers * 0.38, W + 3.5 + tiers * 0.28], [standLen, 0.25, tiers * 0.6 + 4], false, [-8, 0, 0]);
    for (let x = STRAIGHT_FROM; x <= STRAIGHT_TO + 10; x += 15) add(root, "box", M.steel, [x, 4 + tiers * 0.2, W + 4.2 + tiers * 0.55], [0.3, 8 + tiers * 0.4, 0.3], false);
    const home = new pc.Entity("home-stand");
    home.setLocalPosition(0, 1, 0);
    home.setLocalEulerAngles(0, 90, 0);
    root.addChild(home);
    const seats = mat({ color: "#1b2540", gloss: 0.35 });
    if (atlas) crowds.push(new RealCrowd(home, atlas, device, { innerX: W + 3.6, zFrom: STRAIGHT_TO + 8, zTo: STRAIGHT_FROM - 8, tiers: tiers + 2, spacing: quality === "high" ? 0.62 : 0.85, fill: 0.9, sides: [-1], seed: 3, seats }));
    else crowds.push(new Crowd(home, { innerX: W + 3.6, zFrom: STRAIGHT_TO + 8, zTo: STRAIGHT_FROM - 8, tiers, spacing: quality === "high" ? 0.95 : 1.5, fill: 0.88, shadows: false, sides: [-1], seed: 3 }));
    const back = new pc.Entity("back-stand");
    back.setLocalPosition(0, 0.6, 0);
    back.setLocalEulerAngles(0, 90, 0);
    root.addChild(back);
    if (atlas) crowds.push(new RealCrowd(back, atlas, device, { innerX: 2 * R0 + W + 4, zFrom: STRAIGHT_TO, zTo: STRAIGHT_FROM, tiers: quality === "high" ? 6 : 4, spacing: quality === "high" ? 0.7 : 1, fill: 0.85, sides: [1], seed: 9, seats }));
    else crowds.push(new Crowd(back, { innerX: 2 * R0 + W + 4, zFrom: STRAIGHT_TO, zTo: STRAIGHT_FROM, tiers: quality === "high" ? 5 : 3, spacing: quality === "high" ? 1.3 : 2, fill: 0.8, shadows: false, sides: [1], seed: 9 }));
    add(root, "box", M.concrete, [standX, 3, -2 * R0 - W - 8 - 3], [standLen, 7, 0.6], false);
    // Floodlight towers.
    for (const [x, z] of [[-40, 25], [140, 25], [-40, -100], [140, -100]] as const) {
      add(root, "cylinder", M.steel, [x, 17, z], [0.8, 34, 0.8], false);
      const bank = add(root, "box", M.lamp, [x, 34.5, z], [6, 3, 0.4], false);
      bank.lookAt(50, 0, -36);
    }
    // Giant screen beyond the far bend, and the finish clock.
    const scr = add(root, "box", boardMat, [STRAIGHT_FROM - R0 - W - 10, 12, -R0], [0.4, 12, 24], false);
    scr.setLocalEulerAngles(0, 0, 0);
    add(root, "box", M.steel, [STRAIGHT_FROM - R0 - W - 10.4, 6, -R0], [0.6, 12, 25], false);
    add(root, "box", clockMat, [103, 2.2, W + 1.4], [2.4, 0.6, 0.15], false);
    add(root, "box", M.steel, [103, 1, W + 1.5], [0.12, 2, 0.12], false);
  };
  build();

  // Hurdles (rebuilt per event) and athletes.
  let hurdles: pc.Entity[][] = [];
  const buildHurdles = (count: number) => {
    hurdles.flat().forEach((e) => e.destroy());
    hurdles = [];
    for (let i = 0; i < count; i++) {
      const lane: pc.Entity[] = [];
      for (const hx of HURDLES) {
        const h = new pc.Entity("hurdle");
        const p = worldOf("hurdles110", hx, i);
        h.setLocalPosition(p.x, 0, p.z);
        app.root.addChild(h);
        add(h, "box", M.hurdleBar, [0, 0.99, 0], [0.06, 0.08, 1.05], true);
        add(h, "box", M.hurdleStripe, [0, 0.99, 0], [0.065, 0.082, 0.18], false);
        for (const s of [-1, 1]) {
          add(h, "box", M.hurdleLeg, [0, 0.5, s * 0.5], [0.04, 1, 0.04], true);
          add(h, "box", M.hurdleLeg, [-0.3, 0.02, s * 0.5], [0.6, 0.04, 0.04], false);
        }
        lane.push(h);
      }
      hurdles.push(lane);
    }
  };

  let event: EventId = "sprint100";
  let humans: Humanoid[] = [];
  let rigs: RealisticRig[] = [];
  let anims: AthleteAnimator[] = [];
  let shadows: pc.Entity[] = [];
  let javelins: pc.Entity[] = [];
  let poles: pc.Entity[] = [];
  const poleMat = mat({ color: "#e8d34a", gloss: 0.6 });
  const bar = new pc.Entity("pv-bar");
  add(bar, "box", M.hurdleBar, [0, 0, 0], [0.05, 0.05, 17], true);
  add(bar, "box", M.hurdleStripe, [0, 0, -3], [0.055, 0.055, 1], false);
  add(bar, "box", M.hurdleStripe, [0, 0, 3], [0.055, 0.055, 1], false);
  bar.setPosition(90 + 0.6, 4.5, -56 - 7);
  bar.enabled = false;
  app.root.addChild(bar);
  const placePole = (pole: pc.Entity, ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
    pole.setPosition((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    pole.lookAt(bx, by, bz);
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    pole.children[0]!.setLocalScale(0.035, len, 0.035);
  };
  const setupAthletes = (count: number) => {
    rigs.forEach((r) => r.destroy());
    rigs = [];
    humans.forEach((h) => h.destroy());
    shadows.forEach((s) => s.destroy());
    javelins.forEach((j) => j.destroy());
    poles.forEach((p) => p.destroy());
    poles = [];
    humans = [];
    anims = [];
    shadows = [];
    javelins = [];
    for (let i = 0; i < count; i++) {
      const h = createHumanoid(app.root, null, { shadows: quality === "high" || i === 0 });
      h.root.setEulerAngles(0, -90, 0); // face +x
      humans.push(h);
      rigs.push(new RealisticRig(app, h, null, { grip: [0.45, 0.6], shadows: quality === "high" || i === 0 }));
      anims.push(new AthleteAnimator(h, M.javelin, M.tip));
      shadows.push(add(app.root, "cylinder", M.shadow, [0, 0.03, 0], [0.7, 0.002, 0.5], false));
      const jv = new pc.Entity("javelin");
      add(jv, "cylinder", M.javelin, [0, 0, 0], [0.028, 2.6, 0.028], true);
      add(jv, "cone", M.tip, [0, 1.4, 0], [0.03, 0.22, 0.03], false);
      jv.enabled = false;
      app.root.addChild(jv);
      javelins.push(jv);
      const pole = new pc.Entity("pole");
      const shaft = add(pole, "cylinder", poleMat, [0, 0, 0], [0.035, 4.6, 0.035], true);
      shaft.setLocalEulerAngles(90, 0, 0);
      pole.enabled = false;
      app.root.addChild(pole);
      poles.push(pole);
    }
  };

  // Landing puffs (sand) and confetti-free celebration lights handled by the crowd.
  const puffMat = mat({ color: "#e2cc98", opacity: 0.55, noEnv: true });
  const puffs = Array.from({ length: 24 }, () => ({ e: add(app.root, "sphere", puffMat, [0, -5, 0], [0.3, 0.3, 0.3], false), life: 0, vx: 0, vy: 0, vz: 0 }));
  let puffNext = 0;
  const puff = (x: number, z: number) => {
    for (let k = 0; k < 8; k++) {
      const p = puffs[puffNext++ % puffs.length]!;
      p.life = 0.8;
      p.e.setPosition(x, 0.15, z);
      p.vx = (Math.random() - 0.3) * 2;
      p.vy = 0.8 + Math.random();
      p.vz = (Math.random() - 0.5) * 2;
    }
  };

  const camera = new pc.Entity("camera");
  camera.addComponent("camera", { fov: 42, nearClip: 0.1, farClip: 1200, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB });
  app.root.addChild(camera);
  const camPos = new pc.Vec3(40, 20, 40), camLook = new pc.Vec3(50, 0, 0);
  const want = new pc.Vec3(), wantLook = new pc.Vec3();
  let state: EventState | null = null;
  let viewer = 0;
  // Realistic crowd: bake the fan atlas once the athlete models are in, then rebuild the stands.
  if (getGameSettings().graphics === "realistic")
    loadAthleteAssets(app)
      .then(async (as) => {
        const a = await bakeCrowdAtlas(app, as, 5);
        if (dead) return a.destroy();
        atlas = a;
        build();
      })
      .catch((e) => console.warn("[athletics] realistic crowd unavailable", e));
  let celebrate: number[] = [];
  let elapsed = 0;
  const landed = new Set<number>();

  app.on("update", (dt: number) => {
    elapsed += dt;
    crowds.forEach((c) => c.update(dt));
    for (const p of puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const q = p.e.getPosition();
      p.vy -= 3 * dt;
      p.e.setPosition(q.x + p.vx * dt, Math.max(0.05, q.y + p.vy * dt), q.z + p.vz * dt);
      const sz = 0.25 + (0.8 - p.life) * 0.9;
      p.e.setLocalScale(sz, sz * 0.6, sz);
      if (p.life <= 0) p.e.setPosition(0, -5, 0);
    }
    const s = state;
    if (!s) return;
    const portrait = canvas.clientHeight > canvas.clientWidth;
    s.athletes.forEach((a, i) => {
      const h = humans[i];
      if (!h) return;
      const p = worldOf(s.event, a.x, i);
      const yOff = s.event === "longjump" && a.phase === "flight" ? 0 : a.y;
      h.root.setPosition(p.x, yOff, p.z);
      anims[i]!.setJavelinVisible(s.event === "javelin" && a.phase !== "flight" && !(a.phase === "done" && a.marks.length > 0 && a.attempt > 0 && s.phase !== "ready"));
      anims[i]!.update(a, s.event, dt, celebrate[i] ?? 0);
      rigs[i]?.update();
      shadows[i]!.setPosition(p.x, 0.03, p.z);
      // Pole vault: carried pole, then planted in the box during the vault.
      const pole = poles[i];
      if (pole) {
        if (s.event !== "polevault" || (a.phase === "done" && s.phase !== "ready") || (a.phase === "flight" && a.airT > a.airDur * 0.45)) pole.enabled = false;
        else {
          pole.enabled = true;
          if (a.phase === "aiming" || a.phase === "flight") {
            const box = worldOf("polevault", PV.box, i);
            placePole(pole, box.x, 0.05, p.z, p.x - 0.1, yOff + 2.0, p.z + 0.15);
          } else {
            placePole(pole, p.x - 0.9, yOff + 0.95, p.z + 0.32, p.x + 3.4, yOff + 2.7, p.z + 0.32); // carried at the side, tip up
          }
        }
      }
      // Knocked hurdles tip over.
      if (s.event === "hurdles110") {
        hurdles[i]?.forEach((hd, k) => hd.setLocalEulerAngles(0, 0, a.knocked.includes(k) ? -75 : 0));
      }
      // Javelin in flight.
      const jv = javelins[i]!;
      if (s.event === "javelin" && (a.phase === "flight" || (a.phase === "done" && a.marks.length && a.marks[a.marks.length - 1] !== null && s.phase !== "ready"))) {
        jv.enabled = true;
        const jp = worldOf("javelin", a.jx, i);
        const th = (a.flightAngle * Math.PI) / 180;
        const vy = a.flightV * Math.sin(th) - 9.81 * a.airT;
        const vx = a.fvx;
        const pitch = a.phase === "flight" ? Math.atan2(vy, vx) : -0.6;
        jv.setPosition(jp.x, Math.max(0.3, a.jy), jp.z);
        jv.setEulerAngles(0, 0, (pitch * 180) / Math.PI - 90);
      } else {
        jv.enabled = false;
      }
      // Sand puff on landing.
      if (s.event === "longjump" && a.phase === "done" && a.marks.length && a.marks[a.marks.length - 1] !== null) {
        const key = i * 10 + a.attempt;
        if (!landed.has(key)) {
          landed.add(key);
          puff(p.x, p.z);
        }
      }
    });

    // Pole vault bar at the viewer's best height (or the opening height).
    bar.enabled = s.event === "polevault";
    if (bar.enabled) {
      const best = s.athletes[viewer]?.finish ?? null;
      bar.setPosition(90 + 0.6, best !== null ? Math.max(3.5, Math.floor(best * 20) / 20) : 4.5, -56 - 7);
    }
    // Broadcast cameras.
    const me = s.athletes[viewer];
    const race = EVENTS[s.event].kind === "race";
    if (me) {
      const p = worldOf(s.event, me.x, viewer);
      if (race) {
        if (s.phase === "ready") {
          // Low front view of the athletes in the blocks.
          const sx = worldOf(s.event, 0, 0).x;
          want.set(sx + 8, 1.3, -2.5);
          wantLook.set(sx, 0.6, W / 2 + 0.5);
        } else if (s.phase === "over" || me.phase === "done") {
          // Finish: frame the finish line and the runners coming through it.
          const fin = worldOf(s.event, EVENTS[s.event].length, 0).x;
          want.set(fin + 5, 2.4, -4.5);
          wantLook.set(fin - 3, 1.2, W / 2 + 1);
        } else {
          // Tracking camera along the home straight (like TV): side-on, slightly ahead.
          const lead = Math.max(...s.athletes.map((a) => worldOf(s.event, a.x, 0).x));
          const fx = p.x * 0.75 + lead * 0.25;
          // Infield rail camera looking out at the runners with the packed grandstand behind them.
          // Hurdles: sit a little further ahead so the next hurdle is always in view.
          const ahead = s.event === "hurdles110" ? 3 * camLiveliness() : 0;
          want.set(fx - (portrait ? 5 : 3) + ahead, portrait ? 4.2 : 2.4, portrait ? -8 : -4.5);
          wantLook.set(fx + (portrait ? 3 : 5) + ahead * 1.5, 1.4, W + 2);
        }
      } else {
        const flying = me.phase === "flight";
        if (s.event === "javelin" && flying) {
          const jp = worldOf("javelin", me.jx, viewer);
          want.set(jp.x - 12, 6 + me.jy * 0.6, jp.z - 18);
          wantLook.set(jp.x + 6, Math.max(1, me.jy * 0.7), jp.z);
        } else if (s.event === "javelin" && me.phase === "done" && me.marks.length && me.marks[me.marks.length - 1] !== null && s.phase !== "ready") {
          const jp = worldOf("javelin", me.jx, viewer);
          want.set(jp.x - 6, 4, jp.z - 9);
          wantLook.set(jp.x, 0.3, jp.z);
        } else if (s.event === "polevault" && (flying || me.phase === "aiming")) {
          want.set(p.x - 4, 3.5 + me.y * 0.5, p.z - (portrait ? 13 : 9.5));
          wantLook.set(p.x + 1.5, 1.2 + me.y * 0.8, p.z);
        } else {
          want.set(p.x - 3, portrait ? 4 : 2.6, p.z - (portrait ? 11 : 7.5));
          wantLook.set(p.x + (flying ? 3 : 5), 1, p.z);
        }
      }
      const k = 1 - Math.exp(-dt * (s.phase === "ready" ? 2.5 : 5));
      camPos.lerp(camPos, want, k);
      camLook.lerp(camLook, wantLook, Math.min(1, k * 1.5));
      camera.setPosition(camPos);
      camera.lookAt(camLook);
      camera.camera!.fov = portrait ? 70 : race && s.phase === "live" ? 58 : 48;
    }
    // Finish clock.
    if (EVENTS[s.event].kind === "race") {
      const t = s.phase === "ready" ? 0 : Math.max(0, s.t - s.goAt);
      const leader = s.order.length ? s.athletes[s.order[0]!]!.finish ?? t : t;
      const shown = s.order.length ? leader : t;
      const ctx = clockCanvas.getContext("2d")!;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, 0, 256, 64);
      ctx.font = "700 46px 'Courier New', monospace";
      ctx.fillStyle = "#ff4d2e";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(shown.toFixed(2), 128, 34);
      clockTex.setSource(clockCanvas);
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
    setEvent(e, count) {
      event = e;
      landed.clear();
      buildHurdles(e === "hurdles110" ? count : 0);
      if (humans.length !== count) setupAthletes(count);
      void event;
    },
    setState(s, v, c) {
      state = s;
      viewer = v;
      celebrate = c;
    },
    setAthletes(list) {
      if (humans.length !== list.length) setupAthletes(list.length);
      list.forEach((a, i) => {
        humans[i]!.apply(a.avatar);
        rigs[i]?.setLook(a.avatar);
      });
    },
    setBoard(title, lines) {
      const ctx = boardCanvas.getContext("2d")!;
      const grd = ctx.createLinearGradient(0, 0, 0, 512);
      grd.addColorStop(0, "#0a1430");
      grd.addColorStop(1, "#040814");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, 1024, 512);
      ctx.fillStyle = "#ff7a1a";
      ctx.fillRect(0, 0, 1024, 80);
      ctx.font = "800 56px 'Saira Condensed', 'Arial Narrow', sans-serif";
      ctx.fillStyle = "#ffffff";
      ctx.textBaseline = "middle";
      ctx.fillText(title.toUpperCase(), 30, 42);
      ctx.font = "700 44px 'Saira Condensed', 'Arial Narrow', sans-serif";
      lines.slice(0, 8).forEach((l, k) => {
        ctx.fillStyle = k === 0 ? "#ffd23f" : "#e8ecf2";
        ctx.fillText(l, 30, 120 + k * 50);
      });
      boardTex.setSource(boardCanvas);
    },
    cheer(level) {
      crowds.forEach((c) => c.cheer(level));
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      device.maxPixelRatio = ratio();
      build();
      resize();
    },
    destroy() {
      dead = true;
      rigs.forEach((r) => r.destroy());
      atlas?.destroy();
      ro.disconnect();
      crowds.forEach((c) => c.destroy());
      app.destroy();
    },
  };
}
