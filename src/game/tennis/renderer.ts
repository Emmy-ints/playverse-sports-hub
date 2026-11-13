/**
 * PlayCanvas tennis stadium: painted court (hard / clay / grass / indoor / night), net with posts,
 * walls with sponsor boards, stands full of spectators, umpire's chair, a live scoreboard, floodlights,
 * both players (shared humanoid + racket) and the ball with a ground shadow. Visual only — the
 * simulation decides everything; this just draws the latest state each frame.
 */
import * as pc from "playcanvas";
import { camLiveliness } from "@/lib/game-settings";
import type { AvatarConfig } from "@/lib/avatar";
import { Crowd } from "../bowling/crowd.ts";
import { createHumanoid, type Humanoid } from "../character/humanoid.ts";
import { TennisPlayerAnimator } from "./player-anim.ts";
import { COURT } from "./sim.ts";
import type { CourtTheme } from "./themes.ts";

export type Quality = "high" | "low";

export interface ViewPlayer {
  x: number; z: number; vx: number; vz: number;
  swing: "fh" | "bh" | "serve" | "";
  swingAt: number;
  armed: boolean;
}

export interface ViewFrame {
  t: number;
  phase: "serve" | "rally" | "pointOver" | "matchOver";
  server: 0 | 1;
  players: [ViewPlayer, ViewPlayer];
  ball: { x: number; y: number; z: number; vx: number; vy: number; vz: number };
}

export interface ScoreboardData {
  names: [string, string];
  sets: [number, number];
  games: [number, number];
  points: [string, string];
  server: 0 | 1;
  history: [number, number][];
}

export interface TennisView {
  setFrame(f: ViewFrame): void;
  setViewer(p: 0 | 1): void;
  setAvatars(a: [AvatarConfig | null, AvatarConfig | null]): void;
  setScoreboard(d: ScoreboardData): void;
  cheer(level: number): void;
  setQuality(q: Quality): void;
  destroy(): void;
}

const UMPIRE: AvatarConfig = { version: 1, nickname: "Umpire", genderPresentation: "neutral", skinTone: "#a8714b", face: "focused", hairstyle: "short", hairColor: "#4a2c1a", outfit: "polo", outfitColor: "#1d2333", shoes: "court", shoeColor: "#1d2333", accessory: "glasses" };

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse || small ? "low" : "high";
}

function rgb(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}
function pcColor(h: string) {
  const [r, g, b] = rgb(h);
  return new pc.Color(r / 255, g / 255, b / 255);
}

function mat(opts: { color?: string; gloss?: number; metal?: number; map?: pc.Texture; emissive?: string; emissiveMap?: pc.Texture; noEnv?: boolean; opacity?: number; alphaMap?: pc.Texture }) {
  const m = new pc.StandardMaterial();
  m.useMetalness = true;
  m.metalness = opts.metal ?? 0;
  m.gloss = opts.gloss ?? 0.35;
  if (opts.color) m.diffuse = pcColor(opts.color);
  if (opts.map) m.diffuseMap = opts.map;
  if (opts.emissive) m.emissive = pcColor(opts.emissive);
  if (opts.emissiveMap) {
    m.emissiveMap = opts.emissiveMap;
    m.emissive = new pc.Color(1, 1, 1);
  }
  if (opts.alphaMap) {
    m.opacityMap = opts.alphaMap;
    m.opacityMapChannel = "a";
    m.alphaTest = 0.35;
    m.cull = pc.CULLFACE_NONE;
  }
  if (opts.opacity !== undefined) {
    m.opacity = opts.opacity;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
  }
  if (opts.noEnv) m.useSkybox = false;
  m.update();
  return m;
}

function canvasTexture(device: pc.GraphicsDevice, c: HTMLCanvasElement, mip = true) {
  const t = new pc.Texture(device, {
    width: c.width, height: c.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: mip,
    minFilter: mip ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_LINEAR, magFilter: pc.FILTER_LINEAR,
  });
  t.setSource(c);
  t.anisotropy = 8;
  return t;
}

// Painted area covers x ∈ [-AREA_X, AREA_X], z ∈ [-AREA_Z, AREA_Z].
const AREA_X = 9, AREA_Z = 18.5;
const DOUBLES_HALF = 5.485;

function paintCourt(theme: CourtTheme, pxPerM: number) {
  const w = Math.round(AREA_X * 2 * pxPerM), h = Math.round(AREA_Z * 2 * pxPerM);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const X = (x: number) => (x + AREA_X) * pxPerM;
  const Z = (z: number) => (z + AREA_Z) * pxPerM;
  ctx.fillStyle = theme.runoff;
  ctx.fillRect(0, 0, w, h);
  if (theme.surface !== "clay" && theme.surface !== "grass") {
    ctx.fillStyle = theme.court;
    ctx.fillRect(X(-DOUBLES_HALF), Z(-COURT.halfLength), DOUBLES_HALF * 2 * pxPerM, COURT.halfLength * 2 * pxPerM);
  }
  if (theme.surface === "grass") {
    // Mowing stripes across the court, worn patches behind the baselines.
    for (let z = -AREA_Z; z < AREA_Z; z += 1.2) {
      ctx.fillStyle = Math.round((z + AREA_Z) / 1.2) % 2 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)";
      ctx.fillRect(0, Z(z), w, 1.2 * pxPerM);
    }
    for (const s of [1, -1]) {
      const g = ctx.createRadialGradient(X(0), Z(s * (COURT.halfLength + 0.8)), 0, X(0), Z(s * (COURT.halfLength + 0.8)), 3.2 * pxPerM);
      g.addColorStop(0, "rgba(176,150,96,0.75)");
      g.addColorStop(1, "rgba(176,150,96,0)");
      ctx.fillStyle = g;
      ctx.fillRect(X(-4), Z(s * (COURT.halfLength + 0.8)) - 3.2 * pxPerM, 8 * pxPerM, 6.4 * pxPerM);
    }
  }
  // Grain / noise.
  const img = ctx.getImageData(0, 0, w, h);
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  const amp = theme.surface === "clay" ? 26 : theme.surface === "grass" ? 18 : 8;
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd() - 0.5) * amp;
    img.data[i] = Math.max(0, Math.min(255, img.data[i]! + n));
    img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1]! + n));
    img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2]! + n * 0.8));
  }
  ctx.putImageData(img, 0, 0);
  // Lines (5 cm, baselines 10 cm).
  ctx.fillStyle = theme.line;
  ctx.globalAlpha = theme.surface === "clay" ? 0.88 : 0.96;
  const lw = 0.05 * pxPerM;
  const hline = (z: number, x0: number, x1: number, width = lw) => ctx.fillRect(X(x0), Z(z) - width / 2, (x1 - x0) * pxPerM, width);
  const vline = (x: number, z0: number, z1: number) => ctx.fillRect(X(x) - lw / 2, Z(z0), lw, (z1 - z0) * pxPerM);
  for (const s of [1, -1]) {
    hline(s * COURT.halfLength, -DOUBLES_HALF, DOUBLES_HALF, lw * 2);
    hline(s * COURT.serviceLine, -COURT.halfWidth, COURT.halfWidth);
    vline(s * DOUBLES_HALF, -COURT.halfLength, COURT.halfLength);
    vline(s * COURT.halfWidth, -COURT.halfLength, COURT.halfLength);
    ctx.fillRect(X(0) - lw / 2, Z(s * COURT.halfLength) - (s > 0 ? 0.1 * pxPerM : 0), lw, 0.1 * pxPerM); // centre mark
  }
  vline(0, -COURT.serviceLine, COURT.serviceLine);
  ctx.globalAlpha = 1;
  return c;
}

function sponsorBoard(text: string, bg: string) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.font = "800 40px 'Saira Condensed', 'Arial Narrow', sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  const words = [text, "PLAYVERSE OPEN", text, "•"];
  let x = 20, i = 0;
  while (x < c.width) {
    const wd = words[i++ % words.length]!;
    ctx.fillText(wd, x, 34);
    x += ctx.measureText(wd).width + 48;
  }
  return c;
}

function netCanvas() {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "rgba(20,20,20,1)";
  ctx.lineWidth = 1.4;
  for (let x = 0; x <= c.width; x += 5) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
  }
  for (let y = 0; y <= c.height; y += 5) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
  }
  return c;
}

function drawScoreboard(c: HTMLCanvasElement, d: ScoreboardData | null) {
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#06090f";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "#1f3b6b";
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, c.width - 6, c.height - 6);
  ctx.textBaseline = "middle";
  ctx.font = "700 30px 'Saira Condensed', 'Arial Narrow', sans-serif";
  ctx.fillStyle = "#7fb4ff";
  ctx.fillText("PLAYVERSE OPEN", 24, 34);
  if (!d) return;
  for (const p of [0, 1] as const) {
    const y = 100 + p * 70;
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 40px 'Saira Condensed', 'Arial Narrow', sans-serif";
    ctx.fillText((d.server === p ? "● " : "  ") + d.names[p].slice(0, 14).toUpperCase(), 20, y);
    ctx.font = "800 44px 'Saira Condensed', 'Arial Narrow', sans-serif";
    let x = 330;
    for (const set of d.history) {
      ctx.fillStyle = "#9aa7bd";
      ctx.fillText(String(set[p]), x, y);
      x += 40;
    }
    ctx.fillStyle = "#ffd23f";
    ctx.fillText(String(d.games[p]), x, y);
    ctx.fillStyle = "#3dff9a";
    ctx.fillText(d.points[p], 450, y);
  }
}

export async function createTennisView(canvas: HTMLCanvasElement, theme: CourtTheme, initialQuality: Quality = detectQuality()): Promise<TennisView> {
  let quality = initialQuality;
  const app = new pc.Application(canvas, {
    graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" },
  });
  const device = app.graphicsDevice;
  const ratio = () => (quality === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25));
  device.maxPixelRatio = ratio();
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(...theme.ambient);

  // Sky and image-based lighting from a real HDR photograph.
  const envAsset = new pc.Asset(`tennis-sky-${theme.id}`, "texture", { url: theme.hdr }, { mipmaps: false });
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
      console.warn("[tennis] sky unavailable", e);
    }
  });
  app.assets.load(envAsset);

  const shadowType = (pc as unknown as Record<string, number>)["SHADOW_PCF3_32F"] ?? (pc as unknown as Record<string, number>)["SHADOW_PCF3"] ?? 0;
  const sun = new pc.Entity("sun");
  sun.addComponent("light", {
    type: "directional", color: new pc.Color(...theme.sunColor), intensity: theme.sunIntensity, castShadows: true,
    shadowResolution: quality === "high" ? 2048 : 1024, shadowDistance: 60, numCascades: 1, shadowType, shadowBias: 0.3, normalOffsetBias: 0.05,
  });
  sun.lookAt(new pc.Vec3(...theme.sunDir).normalize());
  sun.rotateLocal(90, 0, 0); // lights shine along their −Y axis
  app.root.addChild(sun);

  const world = new pc.Entity("stadium");
  app.root.addChild(world);
  const add = (parent: pc.Entity, type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], shadows = true, rot?: [number, number, number]) => {
    const e = new pc.Entity();
    e.addComponent("render", { type, material: m, castShadows: shadows, receiveShadows: true });
    e.setLocalPosition(...pos);
    e.setLocalScale(scale[0], type === "capsule" ? scale[1] / 2 : scale[1], scale[2]);
    if (rot) e.setLocalEulerAngles(...rot);
    parent.addChild(e);
    return e;
  };

  const M = {
    wall: mat({ color: theme.wall, gloss: 0.3 }),
    post: mat({ color: "#2b2f36", metal: 0.6, gloss: 0.6 }),
    white: mat({ color: "#f6f6f6", gloss: 0.4 }),
    seat: mat({ color: "#16233f", gloss: 0.3, noEnv: true }),
    chair: mat({ color: "#1e5b3e", gloss: 0.35 }),
    ball: mat({ color: "#d9f23a", gloss: 0.15, emissive: "#2a3300" }),
    shadow: mat({ color: "#000000", opacity: 0.38, noEnv: true }),
    frame: mat({ color: "#1d1f24", metal: 0.4, gloss: 0.7 }),
    strings: mat({ color: "#f1f1f1", opacity: 0.45, noEnv: true }),
    grip: mat({ color: "#f5f5f5", gloss: 0.2 }),
    lamp: mat({ color: "#ffffff", emissive: "#fff6dd" }),
    dark: mat({ color: "#26324a", gloss: 0.25 }),
    roof: mat({ color: "#121725", gloss: 0.1, noEnv: true }),
  };

  let crowd: Crowd[] = [];
  let built: pc.Entity | null = null;
  const sbCanvas = document.createElement("canvas");
  sbCanvas.width = 512;
  sbCanvas.height = 220;
  drawScoreboard(sbCanvas, null);
  const sbTex = canvasTexture(device, sbCanvas, false);
  const sbMat = mat({ color: "#000000", emissiveMap: sbTex, noEnv: true });
  const textures: pc.Texture[] = [sbTex];

  const build = () => {
    built?.destroy();
    crowd.forEach((c) => c.destroy());
    crowd = [];
    textures.splice(1).forEach((t) => t.destroy());
    const root = new pc.Entity("venue");
    world.addChild(root);
    built = root;

    // Court surface.
    const courtTex = canvasTexture(device, paintCourt(theme, quality === "high" ? 48 : 30));
    textures.push(courtTex);
    add(root, "plane", mat({ map: courtTex, gloss: theme.surface === "hard" || theme.surface === "indoor" ? 0.42 : 0.12 }), [0, 0, 0], [AREA_X * 2, 1, AREA_Z * 2], false);
    add(root, "plane", mat({ color: theme.runoff, gloss: 0.15, noEnv: true }), [0, -0.01, 0], [120, 1, 140], false);

    // Net, posts and the centre strap.
    const netTex = canvasTexture(device, netCanvas());
    textures.push(netTex);
    const netMat = mat({ color: "#111111", map: netTex, alphaMap: netTex, noEnv: true });
    add(root, "box", netMat, [0, COURT.netHeightCenter / 2 + 0.02, 0], [COURT.postX * 2, COURT.netHeightCenter - 0.02, 0.01], false);
    add(root, "box", M.white, [0, COURT.netHeightCenter, 0], [COURT.postX * 2, 0.06, 0.02]);
    add(root, "box", M.white, [0, COURT.netHeightCenter / 2, 0], [0.05, COURT.netHeightCenter, 0.015], false);
    for (const s of [1, -1]) add(root, "cylinder", M.post, [s * COURT.postX, COURT.netHeightPost / 2, 0], [0.08, COURT.netHeightPost, 0.08]);

    // Back and side walls with sponsor boards.
    const boardTex = canvasTexture(device, sponsorBoard("ACE SPORTS", theme.wall));
    textures.push(boardTex);
    const boardMat = mat({ map: boardTex, gloss: 0.25, ...(theme.night || theme.roof ? { emissiveMap: boardTex } : {}) });
    for (const s of [1, -1]) {
      add(root, "box", boardMat, [0, 0.55, s * 19.2], [24, 1.1, 0.2]);
      add(root, "box", boardMat, [s * 10.6, 0.55, 0], [0.2, 1.1, 38.6], true, [0, 0, 0]);
    }

    // Stands: tiers along both sides and behind each baseline.
    const hi = quality === "high";
    const sideTiers = hi ? 7 : 4, endTiers = hi ? 6 : 3;
    const sideStand = new pc.Entity("side-stands");
    sideStand.setLocalPosition(0, 1.1, 0);
    root.addChild(sideStand);
    crowd.push(new Crowd(sideStand, { innerX: 11.2, zFrom: 17, zTo: -17, tiers: sideTiers, spacing: hi ? 0.62 : 0.85, fill: 0.85, shadows: false }));
    const endStand = new pc.Entity("end-stands");
    endStand.setLocalPosition(0, 1.1, 0);
    endStand.setLocalEulerAngles(0, 90, 0);
    root.addChild(endStand);
    crowd.push(new Crowd(endStand, { innerX: 23.5, zFrom: 10, zTo: -10, tiers: endTiers, spacing: hi ? 0.62 : 0.85, fill: 0.8, shadows: false }));
    // Stadium bowl walls behind the crowd.
    for (const s of [1, -1]) {
      add(root, "box", M.dark, [s * (11.6 + sideTiers * 0.55 + 0.6), 3, 0], [0.6, 6 + sideTiers * 0.4, 46], false);
      add(root, "box", M.dark, [0, 3, s * (23.9 + endTiers * 0.55 + 0.6)], [34, 6 + endTiers * 0.4, 0.6], false);
    }

    // Umpire's chair (with an umpire) and players' benches.
    const ux = -(COURT.postX + 1.3);
    for (const dz of [-0.35, 0.35]) for (const dx of [-0.35, 0.35]) add(root, "box", M.chair, [ux + dx, 0.9, dz], [0.06, 1.8, 0.06]);
    add(root, "box", M.chair, [ux, 1.8, 0], [0.9, 0.12, 0.9]);
    add(root, "box", M.chair, [ux - 0.42, 2.25, 0], [0.08, 0.9, 0.9]);
    const umpire = createHumanoid(root, UMPIRE, { shadows: true });
    umpire.root.setLocalPosition(ux - 0.05, 1.86 - 0.9, 0);
    umpire.root.setLocalEulerAngles(0, -90, 0);
    umpire.hipL.setLocalEulerAngles(90, 0, 0);
    umpire.hipR.setLocalEulerAngles(90, 0, 0);
    umpire.kneeL.setLocalEulerAngles(-90, 0, 0);
    umpire.kneeR.setLocalEulerAngles(-90, 0, 0);
    umpire.shoulderL.setLocalEulerAngles(30, 0, 0);
    umpire.shoulderR.setLocalEulerAngles(30, 0, 0);
    umpire.elbowL.setLocalEulerAngles(50, 0, 0);
    umpire.elbowR.setLocalEulerAngles(50, 0, 0);
    for (const s of [1, -1]) add(root, "box", M.chair, [ux - 0.6, 0.45, s * 2.6], [0.5, 0.9, 1.6]);

    // Big scoreboard over the far end (drawn per viewer).
    const sb = add(root, "box", sbMat, [0, 6.2, -(24.2 + endTiers * 0.55)], [7.2, 3.1, 0.15], false);
    sb.name = "scoreboard";
    const sb2 = add(root, "box", sbMat, [0, 6.2, 24.2 + endTiers * 0.55], [7.2, 3.1, 0.15], false, [0, 180, 0]);
    sb2.name = "scoreboard2";

    // Floodlights for night sessions / indoor ceiling.
    if (theme.night) {
      const corners = quality === "high" ? [[1, 1], [-1, 1], [1, -1], [-1, -1]] : [[1, 1], [-1, -1]];
      for (const [sx, sz] of corners) {
        const x = sx! * 15, z = sz! * 24;
        add(root, "cylinder", M.post, [x, 9, z], [0.35, 18, 0.35]);
        const lampBank = add(root, "box", M.lamp, [x, 18.2, z], [2.4, 1.2, 0.3], false);
        lampBank.lookAt(0, 0, 0);
        const spot = new pc.Entity("flood");
        spot.addComponent("light", { type: "spot", color: new pc.Color(1, 0.97, 0.9), intensity: quality === "high" ? 2.4 : 3.6, range: 70, innerConeAngle: 25, outerConeAngle: 48, castShadows: false });
        spot.setLocalPosition(x, 18, z);
        spot.lookAt(0, 0, 0);
        spot.rotateLocal(90, 0, 0);
        root.addChild(spot);
      }
    }
    if (theme.roof) {
      add(root, "box", M.roof, [0, 22, 0], [70, 0.5, 80], false);
      for (const s of [1, -1]) {
        add(root, "box", M.roof, [s * 30, 11, 0], [0.5, 22, 80], false);
        add(root, "box", M.roof, [0, 11, s * 36], [70, 22, 0.5], false);
      }
      for (const z of [-12, 0, 12]) for (const x of [-6, 6]) add(root, "box", M.lamp, [x, 21.6, z], [5, 0.15, 1.2], false);
      for (const z of [-10, 10]) {
        const l = new pc.Entity("arena-light");
        l.addComponent("light", { type: "spot", color: new pc.Color(1, 1, 1), intensity: 2.2, range: 50, innerConeAngle: 40, outerConeAngle: 70, castShadows: false });
        l.setLocalPosition(0, 20, z);
        l.lookAt(0, 0, z * 0.5);
        l.rotateLocal(90, 0, 0);
        root.addChild(l);
      }
    }
  };
  build();

  // Players, ball and shadow.
  const humans: [Humanoid, Humanoid] = [createHumanoid(app.root, null, { shadows: true }), createHumanoid(app.root, null, { shadows: true })];
  const anims = humans.map((h) => new TennisPlayerAnimator(h, { frame: M.frame, strings: M.strings, grip: M.grip })) as [TennisPlayerAnimator, TennisPlayerAnimator];
  const BALL_D = 0.067 * 1.5; // drawn a little larger than real so it reads on small screens
  const ball = add(app.root, "sphere", M.ball, [0, 1, 0], [BALL_D, BALL_D, BALL_D], true);
  const shadow = add(app.root, "cylinder", M.shadow, [0, 0.005, 0], [0.12, 0.002, 0.12], false);

  // Broadcast camera behind the viewer's baseline.
  const camera = new pc.Entity("camera");
  camera.addComponent("camera", { fov: 46, nearClip: 0.1, farClip: 400, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB });
  app.root.addChild(camera);
  let viewer: 0 | 1 = 0;
  const camPos = new pc.Vec3(0, 14, 34);
  const camTarget = new pc.Vec3(0, 0, 0);
  const want = new pc.Vec3();
  const wantT = new pc.Vec3();

  let frame: ViewFrame | null = null;
  const trail: pc.Vec3[] = [];
  const trailColor = new pc.Color(0.95, 1, 0.6, 1);
  let elapsed = 0;

  app.on("update", (dt: number) => {
    elapsed += dt;
    crowd.forEach((c) => c.update(dt));
    if (!frame) return;
    const f = frame;
    for (const p of [0, 1] as const) {
      const pl = f.players[p];
      anims[p].update({ ...pl, serving: f.phase === "serve" && f.server === p, facing: p === 0 ? -1 : 1 }, f.t, dt);
    }
    const b = f.ball;
    ball.setPosition(b.x, b.y, b.z);
    const hgt = Math.max(0, b.y);
    const sz = 0.1 + hgt * 0.02;
    shadow.setPosition(b.x - theme.sunDir[0] * hgt * 0.15, 0.006, b.z - theme.sunDir[2] * hgt * 0.15);
    shadow.setLocalScale(sz, 0.002, sz);
    const speed = Math.hypot(b.vx, b.vz);
    trail.push(ball.getPosition().clone());
    if (trail.length > 7) trail.shift();
    if (speed > 14 && f.phase === "rally") for (let k = 1; k < trail.length; k++) app.drawLine(trail[k - 1]!, trail[k]!, trailColor, true);

    // Camera.
    const side = viewer === 0 ? 1 : -1;
    const portrait = canvas.clientHeight > canvas.clientWidth;
    const cam = camera.camera!;
    cam.horizontalFov = portrait;
    cam.fov = portrait ? 74 : 46;
    const live = camLiveliness();
    const me = f.players[viewer];
    // Net play: when you come in, the camera moves closer and a little lower.
    const net = Math.max(0, Math.min(1, (COURT.halfLength - Math.abs(me.z)) / (COURT.halfLength * 0.7))) * live;
    // High balls (lobs, high bounces): lift the view so the ball stays in frame.
    const high = Math.max(0, b.y - 3.5) * live;
    const back = (portrait ? 10.2 : 9.6) - net * 3.2;
    const up = (portrait ? 8.4 : 6.2) - net * 1.2 + Math.min(3, high * 0.35);
    // Track your player sideways while keeping the whole court in view.
    want.set(b.x * 0.15 + me.x * (0.12 + 0.25 * live), up, side * (COURT.halfLength + back));
    wantT.set(b.x * 0.25 + me.x * 0.1 * live, 0.2 + Math.min(2.5, high * 0.4), side * (portrait ? 0.5 : -2.5) - side * net * 1.5);
    if (f.phase === "matchOver") {
      // Slow orbit at the end.
      const a = elapsed * 0.15;
      want.set(Math.sin(a) * 22, 9, Math.cos(a) * 22);
      wantT.set(0, 1, 0);
    }
    const k = 1 - Math.exp(-dt * (f.phase === "matchOver" ? 1.5 : 3));
    camPos.lerp(camPos, want, k);
    camTarget.lerp(camTarget, wantT, k);
    camera.setPosition(camPos);
    camera.lookAt(camTarget);
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
    setFrame(f) {
      frame = f;
    },
    setViewer(p) {
      viewer = p;
    },
    setAvatars(a) {
      humans[0].apply(a[0]);
      humans[1].apply(a[1]);
    },
    setScoreboard(d) {
      drawScoreboard(sbCanvas, d);
      sbTex.setSource(sbCanvas);
    },
    cheer(level) {
      crowd.forEach((c) => c.cheer(level));
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
      crowd.forEach((c) => c.destroy());
      app.destroy();
    },
  };
}
