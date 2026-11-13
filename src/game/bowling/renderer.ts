/**
 * PlayCanvas renderer for the bowling alley. Visual only: it draws the scene and replays simulation
 * frames (from the browser in practice, or from the server in online matches). It never decides scores.
 */
import * as pc from "playcanvas";
import { BALL, GUTTER_OUTER, HALF_LANE, HEAD_PIN_Z, LANE, PIN_PROFILE, PIN_SPOTS, PIT_EDGE_Z, type ThrowInput } from "./constants.ts";
import type { SimResult } from "./sim.ts";
import { ballSwirl, carpet, laneGloss, laneWood, maskingSign, maskingSignEmissive, pinDecal } from "./textures.ts";
import type { AvatarConfig } from "@/lib/avatar";
import { createHumanoid } from "../character/humanoid.ts";
import { BowlerAnimator, START_Z, type Reaction } from "./bowler.ts";
import { Crowd } from "./crowd.ts";

export type Quality = "high" | "low";

export interface BowlingView {
  /** Show these pins (1..10) standing on their spots, hide the rest. */
  setRack(standing: readonly number[]): void;
  /** Place the ball at the foul line and show the aim guide for a throw. */
  setAim(aim: Pick<ThrowInput, "x" | "angle" | "spin">, visible: boolean): void;
  /** Dress the bowler in a player's character (null = default look). */
  setBowler(avatar: AvatarConfig | null): void;
  /** Animate the delivery, then replay a simulated throw. Resolves after the bowler's reaction. */
  play(result: SimResult, opts?: { onImpact?: () => void; onRelease?: () => void; reaction?: Reaction }): Promise<void>;
  /** Start the run-up immediately (online: the server result arrives during the approach). */
  beginApproach(startX: number): void;
  setQuality(q: Quality): void;
  resize(): void;
  destroy(): void;
}

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const lowMem = ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 4;
  return coarse || small || lowMem ? "low" : "high";
}

// ---------- geometry helpers ----------
function meshFrom(device: pc.GraphicsDevice, positions: number[], normals: number[], uvs: number[], indices: number[]) {
  const mesh = new pc.Mesh(device);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUvs(0, uvs);
  mesh.setIndices(indices);
  mesh.update(pc.PRIMITIVE_TRIANGLES);
  return mesh;
}

/** Surface of revolution around +Y from a [height, radius] profile (the bowling pin). */
function latheMesh(device: pc.GraphicsDevice, profile: ReadonlyArray<readonly [number, number]>, segments: number) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  const top = profile[profile.length - 1]![0];
  const rings = profile.length;
  for (let i = 0; i < rings; i++) {
    const [h, r] = profile[i]!;
    const prev = profile[Math.max(0, i - 1)]!;
    const next = profile[Math.min(rings - 1, i + 1)]!;
    const dh = next[0] - prev[0];
    const dr = next[1] - prev[1];
    const len = Math.hypot(dh, dr) || 1;
    let nRad = dh / len, nUp = -dr / len;
    if (i === 0) { nRad = 0; nUp = -1; }
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      pos.push(c * r, h, sn * r);
      nor.push(c * nRad, nUp, sn * nRad);
      uv.push(s / segments, h / top);
    }
  }
  const row = segments + 1;
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < segments; s++) {
      const a = i * row + s, b = (i + 1) * row + s, c = i * row + s + 1, d = (i + 1) * row + s + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  return meshFrom(device, pos, nor, uv, idx);
}

function sphereMesh(device: pc.GraphicsDevice, radius: number, lat = 32, lon = 48) {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= lat; i++) {
    const th = (i / lat) * Math.PI;
    for (let j = 0; j <= lon; j++) {
      const ph = (j / lon) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      pos.push(x * radius, y * radius, z * radius);
      nor.push(x, y, z);
      uv.push(j / lon, i / lat);
    }
  }
  for (let i = 0; i < lat; i++) {
    for (let j = 0; j < lon; j++) {
      const a = i * (lon + 1) + j, b = a + lon + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  return meshFrom(device, pos, nor, uv, idx);
}

/** Flat triangle lying on the lane, pointing down-lane (-Z) — a targeting arrow. */
function arrowMesh(device: pc.GraphicsDevice, w: number, l: number) {
  return meshFrom(device, [0, 0, -l, -w, 0, 0, w, 0, 0], [0, 1, 0, 0, 1, 0, 0, 1, 0], [0.5, 1, 0, 0, 1, 0], [0, 1, 2]);
}

function canvasTexture(device: pc.GraphicsDevice, source: HTMLCanvasElement, repeat = false) {
  const tex = new pc.Texture(device, {
    width: source.width,
    height: source.height,
    format: pc.PIXELFORMAT_RGBA8,
    mipmaps: true,
    minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR,
    magFilter: pc.FILTER_LINEAR,
    addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
    addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
  });
  tex.setSource(source);
  tex.anisotropy = 8;
  return tex;
}

function std(opts: Partial<{ opacity: number; noEnv: boolean; diffuse: pc.Color; gloss: number; metalness: number; clearCoat: number; clearCoatGloss: number; emissive: pc.Color; emissiveIntensity: number; diffuseMap: pc.Texture; glossMap: pc.Texture; emissiveMap: pc.Texture; tiling: [number, number] }>) {
  const m = new pc.StandardMaterial();
  m.useMetalness = true;
  m.metalness = opts.metalness ?? 0;
  m.gloss = opts.gloss ?? 0.5;
  if (opts.diffuse) m.diffuse = opts.diffuse;
  if (opts.diffuseMap) {
    m.diffuseMap = opts.diffuseMap;
    if (opts.tiling) m.diffuseMapTiling = new pc.Vec2(opts.tiling[0], opts.tiling[1]);
  }
  if (opts.glossMap) {
    m.glossMap = opts.glossMap;
    if (opts.tiling) m.glossMapTiling = new pc.Vec2(opts.tiling[0], opts.tiling[1]);
  }
  if (opts.clearCoat) {
    m.clearCoat = opts.clearCoat;
    m.clearCoatGloss = opts.clearCoatGloss ?? 0.9;
  }
  if (opts.emissive) {
    m.emissive = opts.emissive;
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
  }
  if (opts.emissiveMap) m.emissiveMap = opts.emissiveMap;
  if (opts.opacity !== undefined) {
    m.opacity = opts.opacity;
    m.blendType = pc.BLEND_NORMAL;
    m.depthWrite = false;
  }
  // Matte room surfaces shouldn't mirror the studio HDR at grazing angles.
  if (opts.noEnv) m.useSkybox = false;
  m.update();
  return m;
}

const hex = (h: string) => {
  const n = parseInt(h.replace("#", ""), 16);
  return new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
};

// ---------- scene ----------
export async function createBowlingView(canvas: HTMLCanvasElement, initialQuality: Quality = detectQuality()): Promise<BowlingView> {
  let quality = initialQuality;
  const app = new pc.Application(canvas, {
    mouse: new pc.Mouse(canvas),
    touch: new pc.TouchDevice(canvas),
    graphicsDeviceOptions: { antialias: true, alpha: false, powerPreference: "high-performance" },
  });
  const device = app.graphicsDevice;
  device.maxPixelRatio = quality === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25);
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  app.scene.ambientLight = new pc.Color(0.09, 0.09, 0.12);

  const root = new pc.Entity("alley");
  app.root.addChild(root);

  const add = (name: string, parent: pc.Entity, cfg: { type?: string; material?: pc.Material; mesh?: pc.Mesh; pos?: [number, number, number]; scale?: [number, number, number]; rot?: [number, number, number]; shadows?: boolean }) => {
    const e = new pc.Entity(name);
    if (cfg.mesh) {
      e.addComponent("render", { meshInstances: [new pc.MeshInstance(cfg.mesh, cfg.material ?? new pc.StandardMaterial())], castShadows: cfg.shadows ?? false, receiveShadows: true });
    } else {
      e.addComponent("render", { type: cfg.type ?? "box", material: cfg.material, castShadows: cfg.shadows ?? false, receiveShadows: true });
    }
    if (cfg.pos) e.setLocalPosition(...cfg.pos);
    if (cfg.scale) e.setLocalScale(...cfg.scale);
    if (cfg.rot) e.setLocalEulerAngles(...cfg.rot);
    parent.addChild(e);
    return e;
  };

  // Materials
  const laneTex = canvasTexture(device, laneWood(39, 1024, 2048, "maple"), true);
  const deckTex = canvasTexture(device, laneWood(39, 1024, 1024, "deck"), true);
  const glossTex = canvasTexture(device, laneGloss(), true);
  const laneLen = -PIT_EDGE_Z;
  const laneMat = std({ diffuseMap: laneTex, tiling: [1, laneLen / 3], glossMap: glossTex, gloss: 0.72, clearCoat: 1, clearCoatGloss: 0.93 });
  const approachMat = std({ diffuseMap: laneTex, tiling: [1, 1.5], gloss: 0.6, clearCoat: 0.6, clearCoatGloss: 0.85 });
  const deckMat = std({ diffuseMap: deckTex, tiling: [1, 0.5], gloss: 0.7, clearCoat: 0.8 });
  const gutterMat = std({ diffuse: hex("#1a1d26"), metalness: 0.6, gloss: 0.45 });
  const wallMat = std({ noEnv: true, diffuse: hex("#0d1120"), gloss: 0.3 });
  const darkMat = std({ noEnv: true, diffuse: hex("#06070c"), gloss: 0.2 });
  const carpetMat = std({ noEnv: true, diffuseMap: canvasTexture(device, carpet(), true), tiling: [6, 3], gloss: 0.05 });
  const pinMat = std({ diffuseMap: canvasTexture(device, pinDecal()), gloss: 0.88, clearCoat: 1, clearCoatGloss: 0.95 });
  const ballMat = std({ diffuseMap: canvasTexture(device, ballSwirl()), gloss: 0.9, metalness: 0.1, clearCoat: 1, clearCoatGloss: 0.97 });
  const holeMat = std({ noEnv: true, diffuse: hex("#020203"), gloss: 0.2 });
  const arrowMat = std({ diffuse: hex("#3b1d0c"), gloss: 0.7, clearCoat: 1 });
  const neonBlue = std({ diffuse: hex("#000000"), emissive: hex("#2f8bff"), emissiveIntensity: 3 });
  const neonOrange = std({ diffuse: hex("#000000"), emissive: hex("#ff7a1a"), emissiveIntensity: 3 });
  const ceilingLight = std({ diffuse: hex("#000000"), emissive: hex("#fff3dd"), emissiveIntensity: 2.2 });
  const signMat = std({ diffuseMap: canvasTexture(device, maskingSign()), emissiveMap: canvasTexture(device, maskingSignEmissive()), emissive: hex("#ffffff"), emissiveIntensity: 2.5, gloss: 0.4 });

  const pinMesh = latheMesh(device, PIN_PROFILE, 28);
  const ballMesh = sphereMesh(device, BALL.radius, 40, 56);
  const arrowGeom = arrowMesh(device, 0.018, 0.09);

  const laneSpacing = 2 * GUTTER_OUTER + 0.18;
  const laneMidZ = PIT_EDGE_Z / 2;

  /** Builds the visual of one lane. The playable lane is at offset 0; others are decoration. */
  const buildLane = (offsetX: number, withPins: boolean) => {
    const g = new pc.Entity("lane");
    g.setLocalPosition(offsetX, 0, 0);
    root.addChild(g);
    add("lane-bed", g, { material: laneMat, pos: [0, -0.05, laneMidZ], scale: [LANE.width, 0.1, laneLen] });
    add("approach", g, { material: approachMat, pos: [0, -0.05, 2.4], scale: [LANE.width + 2 * LANE.gutterWidth, 0.1, 4.8] });
    add("foul-line", g, { material: darkMat, pos: [0, 0.001, 0], scale: [LANE.width + 2 * LANE.gutterWidth, 0.002, 0.012] });
    add("deck", g, { material: deckMat, pos: [0, -0.049, (HEAD_PIN_Z + 0.25 + PIT_EDGE_Z) / 2], scale: [LANE.width, 0.1, HEAD_PIN_Z + 0.25 - PIT_EDGE_Z] });
    for (const side of [-1, 1]) {
      add("gutter", g, { material: gutterMat, pos: [side * (HALF_LANE + LANE.gutterWidth / 2), -LANE.gutterDepth - 0.05, laneMidZ], scale: [LANE.gutterWidth, 0.1, laneLen] });
      add("kickback", g, { material: wallMat, pos: [side * (GUTTER_OUTER + 0.03), 0.25, HEAD_PIN_Z - 0.2], scale: [0.06, 0.6, 2.2] });
      add("neon-rail", g, { material: side < 0 ? neonBlue : neonOrange, pos: [side * (GUTTER_OUTER + 0.07), 0.02, laneMidZ], scale: [0.012, 0.012, laneLen] });
    }
    // Targeting arrows 15 ft down-lane, and dots at 7 ft.
    const board = LANE.width / 39;
    for (const b of [5, 10, 15, 20, 25, 30, 35]) {
      const x = -HALF_LANE + (b - 0.5) * board;
      const depth = Math.abs(b - 20) * 0.03;
      add("arrow", g, { mesh: arrowGeom, material: arrowMat, pos: [x, 0.0012, -4.57 - depth] });
      add("dot", g, { type: "cylinder", material: arrowMat, pos: [x, 0.0012, -2.13], scale: [0.012, 0.0005, 0.012] });
    }
    // Pit, back wall, masking unit with the PLAYVERSE sign.
    add("pit", g, { material: darkMat, pos: [0, -LANE.pitDepth - 0.05, PIT_EDGE_Z - LANE.pitLength / 2], scale: [2 * GUTTER_OUTER, 0.1, LANE.pitLength] });
    add("curtain", g, { material: darkMat, pos: [0, 0.4, PIT_EDGE_Z - LANE.pitLength - 0.05], scale: [2 * GUTTER_OUTER + 0.2, 1.6, 0.1] });
    add("masking", g, { material: signMat, type: "plane", pos: [0, 0.95, HEAD_PIN_Z + 0.35], rot: [90, 0, 0], scale: [2 * GUTTER_OUTER + 0.18, 1, 0.48] });
    add("masking-box", g, { material: wallMat, pos: [0, 0.95, HEAD_PIN_Z - 0.25], scale: [2 * GUTTER_OUTER + 0.2, 0.5, 1.1] });
    if (withPins) {
      for (const [x, z] of PIN_SPOTS) add("deco-pin", g, { mesh: pinMesh, material: pinMat, pos: [x, 0, z] });
    }
    return g;
  };

  buildLane(0, false);
  const decoLanes: pc.Entity[] = [];
  const decoCount = () => (quality === "high" ? 2 : 1);
  const rebuildDeco = () => {
    decoLanes.splice(0).forEach((e) => e.destroy());
    for (let i = 1; i <= decoCount(); i++) for (const s of [-1, 1]) decoLanes.push(buildLane(s * laneSpacing * i, true));
  };
  rebuildDeco();

  // Building: floor, walls, ceiling strip lights.
  const hallWidth = laneSpacing * 5 + 9; // five lanes plus spectator galleries on both sides
  add("carpet", root, { material: carpetMat, pos: [0, -0.06, 7.5], scale: [hallWidth, 0.1, 5.5] });
  add("ceiling", root, { material: wallMat, pos: [0, 3.2, laneMidZ + 2], scale: [hallWidth, 0.1, laneLen + 12] });
  add("wall-l", root, { material: wallMat, pos: [-hallWidth / 2, 1.6, laneMidZ + 2], scale: [0.1, 3.2, laneLen + 12] });
  add("wall-r", root, { material: wallMat, pos: [hallWidth / 2, 1.6, laneMidZ + 2], scale: [0.1, 3.2, laneLen + 12] });
  add("wall-back", root, { material: wallMat, pos: [0, 1.6, 10.2], scale: [hallWidth, 3.2, 0.1] });
  for (let z = 2; z > PIT_EDGE_Z; z -= 3) {
    add("strip", root, { material: ceilingLight, pos: [0, 3.14, z], scale: [hallWidth * 0.9, 0.02, 0.12] });
  }
  add("neon-ceiling-b", root, { material: neonBlue, pos: [0, 3.12, HEAD_PIN_Z + 1.2], scale: [hallWidth, 0.03, 0.03] });
  // Spectator galleries: raised floor, glass balustrade with LED strip, and colourful wall panels.
  const galleryX = laneSpacing * 2.5 + 0.35;
  const galleryMat = std({ diffuse: hex("#1b2140"), gloss: 0.5 });
  const glassMat = std({ diffuse: hex("#9fd3ff"), gloss: 0.95, opacity: 0.07 });
  const panelMats = ["#ff2fb3", "#20e3ff", "#ffb020", "#8b5cf6"].map((c) => std({ diffuse: hex("#000000"), emissive: hex(c), emissiveIntensity: 0.9 }));
  for (const s of [-1, 1]) {
    add("gallery-floor", root, { material: galleryMat, pos: [s * (galleryX + 2), 0.15, -2.5], scale: [4, 0.3, 17] });
    add("gallery-glass", root, { material: glassMat, pos: [s * (galleryX + 0.05), 0.55, -2.5], scale: [0.02, 0.5, 17] });
    add("gallery-led", root, { material: s < 0 ? neonBlue : neonOrange, pos: [s * (galleryX + 0.05), 0.81, -2.5], scale: [0.04, 0.025, 17] });
    for (let k = 0; k < 6; k++) {
      add("wall-panel", root, { material: panelMats[(k + (s > 0 ? 2 : 0)) % panelMats.length]!, pos: [s * (hallWidth / 2 - 0.06), 2.3, 3.5 - k * 3.2], scale: [0.02, 0.9, 2.2] });
    }
  }
  // Big screen above the pins and a lounge wall behind the approach.
  add("screen-frame", root, { material: wallMat, pos: [0, 2.55, HEAD_PIN_Z - 1.6], scale: [laneSpacing * 3.2, 0.9, 0.08] });
  add("neon-ceiling-o", root, { material: neonOrange, pos: [0, 3.12, HEAD_PIN_Z + 1.4], scale: [hallWidth, 0.03, 0.03] });

  // Lights.
  const shadowType = (pc as unknown as Record<string, number>)["SHADOW_PCF3_32F"] ?? (pc as unknown as Record<string, number>)["SHADOW_PCF3"] ?? 0;
  const spot = (name: string, pos: [number, number, number], intensity: number, range: number, outer: number, shadows: boolean) => {
    const e = new pc.Entity(name);
    e.addComponent("light", {
      type: "spot",
      color: new pc.Color(1, 0.96, 0.9),
      intensity,
      range,
      innerConeAngle: outer * 0.55,
      outerConeAngle: outer,
      castShadows: shadows,
      shadowResolution: quality === "high" ? 2048 : 1024,
      shadowType,
      shadowBias: 0.2,
      normalOffsetBias: 0.04,
    });
    e.setLocalPosition(...pos);
    root.addChild(e);
    return e;
  };
  const pinLight = spot("pin-light", [0, 2.6, HEAD_PIN_Z - 0.3], 6, 7, 38, true);
  const laneLights = [spot("lane-1", [0, 3, -3], 3, 9, 60, false), spot("lane-2", [0, 3, -9], 3, 9, 60, false), spot("lane-3", [0, 3, -14], 3, 9, 60, false)];
  const approachLight = spot("approach", [0, 3, 1.5], 3.5, 8, 55, quality === "high");
  // Warm lights over the spectator galleries and the lounge so the crowd is clearly visible.
  const crowdLight = (pos: [number, number, number], range: number) => {
    const e = new pc.Entity("crowd-light");
    e.addComponent("light", { type: "point", color: new pc.Color(1, 0.9, 0.78), intensity: 1.6, range, castShadows: false });
    e.setLocalPosition(...pos);
    root.addChild(e);
  };
  for (const sx of [-1, 1]) for (const z of [2, -3, -8]) crowdLight([sx * (laneSpacing * 2.5 + 2.2), 2.6, z], 6.5);
  crowdLight([-4, 2.6, 6.8], 7);
  crowdLight([4, 2.6, 6.8], 7);
  void pinLight;
  void laneLights;
  void approachLight;

  // Image-based lighting: a real studio HDR (Poly Haven, CC0) gives the lacquered lane and pins true reflections.
  const envAsset = new pc.Asset("studio-env", "texture", { url: "/assets/env/studio.hdr" }, { mipmaps: false });
  app.assets.add(envAsset);
  envAsset.ready(() => {
    try {
      const tex = envAsset.resource as pc.Texture;
      const lighting = pc.EnvLighting.generateLightingSource(tex);
      app.scene.envAtlas = pc.EnvLighting.generateAtlas(lighting);
      lighting.destroy();
      app.scene.skyboxIntensity = 0.22;
    } catch (e) {
      console.warn("[bowling] environment lighting unavailable", e);
    }
  });
  app.assets.load(envAsset);

  // Dynamic objects: the ball and ten pins.
  const ball = add("ball", root, { mesh: ballMesh, material: ballMat, shadows: true });
  // Finger holes (two fingers + thumb) on the ball's surface.
  for (const [ax, ay] of [[-0.022, 0.03], [0.022, 0.03], [0, -0.035]] as const) {
    const n = new pc.Vec3(ax, BALL.radius, ay).normalize();
    const hole = add("hole", ball, { type: "cylinder", material: holeMat, scale: [0.022, 0.004, 0.022] });
    hole.setLocalPosition(n.x * (BALL.radius - 0.001), n.y * (BALL.radius - 0.001), n.z * (BALL.radius - 0.001));
    hole.lookAt(0, 0, 0);
    hole.rotateLocal(90, 0, 0);
  }
  const pins = PIN_SPOTS.map((_, i) => add(`pin-${i + 1}`, root, { mesh: pinMesh, material: pinMat, shadows: true }));

  // Ball-return machines between the lanes, each with a rack of house balls.
  const returnMat = std({ diffuse: hex("#121628"), metalness: 0.4, gloss: 0.75, clearCoat: 0.6 });
  const houseBalls = ["#e0307a", "#2fbf71", "#f2c230", "#8b5cf6", "#ff7a1a", "#0ea5e9"].map((c) => std({ diffuse: hex(c), gloss: 0.9, clearCoat: 1, clearCoatGloss: 0.95 }));
  const smallBall = sphereMesh(device, BALL.radius, 20, 28);
  for (let i = -decoCount(); i <= decoCount() - 1; i++) {
    const x = (i + 0.5) * laneSpacing;
    add("ball-return", root, { material: returnMat, pos: [x, 0.32, 2.6], scale: [0.42, 0.64, 1.1], shadows: true });
    add("ball-return-hood", root, { material: neonBlue, pos: [x, 0.65, 2.6], scale: [0.44, 0.02, 1.12] });
    for (let b = 0; b < 3; b++) add("house-ball", root, { mesh: smallBall, material: houseBalls[(b + i + 6) % houseBalls.length]!, pos: [x, 0.66 + BALL.radius, 2.25 + b * 0.24], shadows: true });
  }

  // Spectators: tiered galleries along both side walls (visible beside the lanes) and a lounge
  // behind the approach with people sitting at the tables watching.
  const crowd = new Crowd(root, {
    innerX: laneSpacing * 2.5 + 0.9,
    zFrom: 5,
    zTo: -10,
    tiers: quality === "high" ? 4 : 3,
    spacing: quality === "high" ? 0.6 : 0.85,
    fill: quality === "high" ? 0.85 : 0.65,
    shadows: false,
  });
  const lounge = new pc.Entity("lounge");
  lounge.setLocalPosition(0, 0, 0);
  lounge.setLocalEulerAngles(0, 90, 0);
  root.addChild(lounge);
  const loungeCrowd = new Crowd(lounge, { innerX: 6.4, zFrom: hallWidth / 2 - 1, zTo: -hallWidth / 2 + 1, tiers: 2, spacing: quality === "high" ? 0.7 : 1, fill: 0.7, shadows: false, sides: [-1], seed: 7 });
  // Neighbouring lanes: other bowlers waiting their turn and occasionally bowling.
  const neighbours: { anim: BowlerAnimator; next: number; resetAt: number }[] = [];
  const neighbourLooks: AvatarConfig[] = [
    { version: 1, nickname: "Mara", genderPresentation: "feminine", skinTone: "#eac0a0", face: "smile", hairstyle: "ponytail", hairColor: "#8a5a2b", outfit: "polo", outfitColor: "#e0307a", shoes: "runner", shoeColor: "#e8eaf0", accessory: "none" },
    { version: 1, nickname: "Deji", genderPresentation: "masculine", skinTone: "#7a4b2e", face: "focused", hairstyle: "buzz", hairColor: "#1b1410", outfit: "jersey", outfitColor: "#2fbf71", shoes: "court", shoeColor: "#1d2333", accessory: "wristbands" },
  ];
  for (const [i, x] of [[0, -laneSpacing * 2], [1, laneSpacing * 2]] as const) {
    const holder = new pc.Entity("neighbour");
    holder.setLocalPosition(x, 0, 0);
    root.addChild(holder);
    const h = createHumanoid(holder, neighbourLooks[i]!, { shadows: quality === "high" });
    const anim = new BowlerAnimator(h);
    anim.ready(0);
    neighbours.push({ anim, next: 4 + i * 6, resetAt: -1 });
  }

  // The bowler: the player's own character.
  const bowlerHumanoid = createHumanoid(root, null, { shadows: true });
  const bowler = new BowlerAnimator(bowlerHumanoid);
  bowler.ready(0);

  // Aim guide.
  const guide = add("aim-guide", root, { material: neonBlue, scale: [0.01, 0.002, 6] });

  // Camera.
  const camera = new pc.Entity("camera");
  camera.addComponent("camera", {
    clearColor: new pc.Color(0.01, 0.012, 0.02),
    fov: 50,
    nearClip: 0.05,
    farClip: 60,
    toneMapping: pc.TONEMAP_ACES,
    gammaCorrection: pc.GAMMA_SRGB,
  });
  root.addChild(camera);

  // Glow (bloom) on capable devices, when this engine version provides CameraFrame.
  let cameraFrame: { destroy?: () => void } | null = null;
  const enableGlow = (on: boolean) => {
    try {
      cameraFrame?.destroy?.();
      cameraFrame = null;
      const CF = (pc as unknown as Record<string, unknown>)["CameraFrame"] as (new (a: pc.AppBase, c: pc.CameraComponent) => {
        rendering: Record<string, unknown>;
        bloom: Record<string, unknown>;
        update: () => void;
        destroy?: () => void;
      }) | undefined;
      if (!on || !CF || !camera.camera) return;
      const cf = new CF(app, camera.camera);
      cf.rendering["toneMapping"] = pc.TONEMAP_ACES;
      cf.rendering["samples"] = 4;
      cf.bloom["intensity"] = 0.008;
      cf.bloom["blurLevel"] = 14;
      cf.update();
      cameraFrame = cf;
    } catch (e) {
      console.warn("[bowling] glow unavailable", e);
      cameraFrame = null;
    }
  };
  enableGlow(quality === "high");
  const camPos = new pc.Vec3(0.4, 1.95, START_Z + 2.7);
  const camTarget = new pc.Vec3(0, 0.45, -12);
  const desiredPos = camPos.clone();
  const desiredTarget = camTarget.clone();
  camera.setPosition(camPos);
  camera.lookAt(camTarget);

  type Mode = "aim" | "approach" | "follow" | "pins" | "react";
  let mode: Mode = "aim";
  let playback: {
    result: SimResult;
    t: number;
    started: boolean;
    resolve: () => void;
    onImpact?: () => void;
    reaction: Reaction;
    impacted: boolean;
    finishedAt: number | null;
    pinEntities: pc.Entity[];
  } | null = null;
  const handBall = new pc.Vec3();

  const setPose = (e: pc.Entity, f: number[], o: number, g: number[] | undefined, a: number) => {
    const lerp = (i: number) => (g ? f[o + i]! + (g[o + i]! - f[o + i]!) * a : f[o + i]!);
    e.setPosition(lerp(0), lerp(1), lerp(2));
    const q1 = new pc.Quat(f[o + 3]!, f[o + 4]!, f[o + 5]!, f[o + 6]!);
    if (g) {
      const q2 = new pc.Quat(g[o + 3]!, g[o + 4]!, g[o + 5]!, g[o + 6]!);
      e.setRotation(new pc.Quat().slerp(q1, q2, a));
    } else e.setRotation(q1);
  };

  // Confetti burst over the pin deck for strikes and spares.
  const confettiMats = ["#ff2fb3", "#20e3ff", "#ffd23f", "#3dff9a", "#ffffff"].map((c) => std({ diffuse: hex(c), emissive: hex(c), emissiveIntensity: 0.6 }));
  const confetti = Array.from({ length: quality === "high" ? 140 : 70 }, (_, k) => ({
    e: add("confetti", root, { type: "box", material: confettiMats[k % confettiMats.length]!, scale: [0.035, 0.002, 0.05] }),
    v: new pc.Vec3(), spin: new pc.Vec3(), life: 0,
  }));
  confetti.forEach((c) => (c.e.enabled = false));
  const burstConfetti = (amount: number) => {
    const n = Math.floor(confetti.length * amount);
    for (let k = 0; k < n; k++) {
      const c = confetti[k]!;
      c.e.enabled = true;
      c.life = 2.6 + Math.random();
      c.e.setLocalPosition((Math.random() - 0.5) * 0.9, 0.6 + Math.random() * 0.4, HEAD_PIN_Z - 0.3 + (Math.random() - 0.5) * 0.6);
      c.v.set((Math.random() - 0.5) * 3.2, 3.2 + Math.random() * 2.6, 1.2 + Math.random() * 2.2);
      c.spin.set(Math.random() * 720, Math.random() * 720, Math.random() * 720);
    }
  };
  const updateConfetti = (dt: number) => {
    for (const c of confetti) {
      if (c.life <= 0) continue;
      c.life -= dt;
      c.v.y -= 3.5 * dt;
      c.v.x *= 1 - dt * 0.8;
      c.v.z *= 1 - dt * 0.8;
      if (c.v.y < -0.9) c.v.y = -0.9; // flutter
      const p = c.e.getLocalPosition();
      c.e.setLocalPosition(p.x + c.v.x * dt + Math.sin(c.life * 9) * 0.004, Math.max(0.01, p.y + c.v.y * dt), p.z + c.v.z * dt);
      const r = c.e.getLocalEulerAngles();
      c.e.setLocalEulerAngles(r.x + c.spin.x * dt, r.y + c.spin.y * dt, r.z + c.spin.z * dt);
      if (c.life <= 0) c.e.enabled = false;
    }
  };

  let earlyApproach = false;
  app.on("update", (dt: number) => {
    bowler.update(dt);
    crowd.update(dt);
    loungeCrowd.update(dt);
    for (const n of neighbours) {
      n.anim.update(dt);
      n.next -= dt;
      if (n.resetAt > 0) {
        n.resetAt -= dt;
        if (n.resetAt <= 0) n.anim.ready(0); // walk back to the top of the approach
      }
      if (n.next <= 0) {
        n.anim.ready(0);
        n.anim.start();
        n.next = 14 + Math.random() * 12;
        n.resetAt = 4.5;
      }
    }
    updateConfetti(dt);
    if (bowler.isHoldingBall) {
      bowler.ballPosition(handBall);
      ball.setPosition(handBall);
    }
    if ((playback && !playback.started) || (!playback && earlyApproach)) {
      // Approach: the camera tracks the bowler from behind.
      mode = "approach";
      const bp = bowler.position;
      desiredPos.set(bp.x * 0.5 + 0.75, 1.9, bp.z + 2.8);
      desiredTarget.set(bp.x * 0.3, 0.45, bp.z - 12);
    } else if (playback && playback.finishedAt !== null) {
      // After the pins settle, show the bowler's reaction.
      mode = "react";
      const bp = bowler.position;
      desiredPos.set(bp.x - 1.6, 1.35, bp.z - 2.4);
      desiredTarget.set(bp.x, 1.1, bp.z);
      playback.finishedAt += dt;
      if (playback.finishedAt > 1.9) {
        const done = playback.resolve;
        playback = null;
        done();
      }
    } else if (playback) {
      const { result } = playback;
      const slow = result.impactFrame >= 0 && playback.t * result.fps >= result.impactFrame && playback.t * result.fps < result.impactFrame + result.fps * 0.8;
      playback.t += dt * (slow ? 0.55 : 1);
      const fi = playback.t * result.fps;
      const i = Math.min(result.frames.length - 1, Math.floor(fi));
      const a = fi - i;
      const f = result.frames[i]!;
      const g = result.frames[i + 1];
      setPose(ball, f, 0, g, a);
      playback.pinEntities.forEach((pe, k) => setPose(pe, f, 7 + k * 7, g, a));
      const bz = ball.getPosition().z;
      if (!playback.impacted && result.impactFrame >= 0 && i >= result.impactFrame) {
        playback.impacted = true;
        playback.onImpact?.();
      }
      // Camera: chase the ball, then settle on the pin deck.
      if (bz > HEAD_PIN_Z + 4) {
        mode = "follow";
        const bp = ball.getPosition();
        desiredPos.set(bp.x * 0.5, 0.9, bp.z + 3.2);
        desiredTarget.set(bp.x * 0.3, 0.1, bp.z - 6);
      } else {
        mode = "pins";
        desiredPos.set(0, 1.0, HEAD_PIN_Z + 3.0);
        desiredTarget.set(0, 0.15, HEAD_PIN_Z - 0.45);
      }
      if (i >= result.frames.length - 1) {
        playback.finishedAt = 0;
        bowler.react(playback.reaction);
        if (playback.reaction === "strike") {
          crowd.cheer(1);
          loungeCrowd.cheer(1);
          burstConfetti(1);
        } else if (playback.reaction === "spare") {
          crowd.cheer(0.6);
          loungeCrowd.cheer(0.6);
          burstConfetti(0.5);
        }
      }
    }
    const k = 1 - Math.exp(-dt * (mode === "follow" ? 6 : mode === "approach" ? 5 : 3));
    camPos.lerp(camPos, desiredPos, k);
    camTarget.lerp(camTarget, desiredTarget, k);
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

  const view: BowlingView = {
    setRack(standing) {
      pins.forEach((p, i) => {
        const up = standing.includes(i + 1);
        p.enabled = up;
        const [x, z] = PIN_SPOTS[i]!;
        p.setPosition(x, 0, z);
        p.setEulerAngles(0, 0, 0);
      });
    },
    setAim(aim, visible) {
      earlyApproach = false;
      bowler.holdAtRelease = false;
      ball.enabled = true;
      ball.setEulerAngles(0, 0, 0);
      bowler.ready(aim.x);
      bowler.ballPosition(handBall);
      ball.setPosition(handBall);
      guide.enabled = visible;
      const len = 6;
      guide.setPosition(aim.x + Math.sin(aim.angle) * (len / 2 + 0.3), 0.002, -Math.cos(aim.angle) * (len / 2 + 0.3) + 0.3);
      guide.setEulerAngles(0, -(aim.angle * 180) / Math.PI, 0);
      mode = "aim";
      desiredPos.set(aim.x * 0.5 + 0.85, 2.15, START_Z + 3.1);
      desiredTarget.set(aim.x * 0.2, 0.35, -13);
    },
    setBowler(avatar) {
      bowlerHumanoid.apply(avatar);
    },
    beginApproach(startX) {
      guide.enabled = false;
      bowler.ready(startX);
      bowler.holdAtRelease = true;
      bowler.onRelease = null;
      bowler.start();
      // Camera follows the run-up straight away.
      playback = null;
      earlyApproach = true;
    },
    play(result, opts) {
      guide.enabled = false;
      const pinEntities = result.pins.map((id) => pins[id - 1]!);
      pins.forEach((p, i) => (p.enabled = result.pins.includes(i + 1)));
      // Stand the bowler where this ball was released from, then run the approach
      // (or continue the run-up that already started when the player let go).
      const startX = result.frames[0]?.[0] ?? 0;
      const continuing = earlyApproach && bowler.approaching;
      earlyApproach = false;
      bowler.holdAtRelease = false;
      if (!continuing) bowler.ready(startX);
      return new Promise<void>((resolve) => {
        const pb = {
          result,
          t: 0,
          started: false,
          resolve,
          reaction: opts?.reaction ?? null,
          impacted: false,
          finishedAt: null as number | null,
          pinEntities,
          ...(opts?.onImpact ? { onImpact: opts.onImpact } : {}),
        };
        playback = pb;
        bowler.onRelease = () => {
          pb.started = true;
          opts?.onRelease?.();
        };
        if (!continuing) bowler.start();
      });
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      device.maxPixelRatio = q === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25);
      rebuildDeco();
      enableGlow(q === "high");
      resize();
    },
    resize,
    destroy() {
      ro.disconnect();
      crowd.destroy();
      loungeCrowd.destroy();
      cameraFrame?.destroy?.();
      app.destroy();
    },
  };
  view.setRack([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  view.setAim({ x: 0, angle: 0, spin: 0 }, true);
  return view;
}
