/**
 * PlayCanvas golf course renderer: real-photo sky (HDR), sun with shadows, sculpted terrain with a
 * painted course map (mown fairway stripes, greens, bunkers, water), trees, flag, the golfer, and
 * shot playback with a TV-style tracer. Visual only — shot outcomes come from the simulation.
 */
import * as pc from "playcanvas";
import type { AvatarConfig } from "@/lib/avatar";
import { createHumanoid } from "../character/humanoid.ts";
import { RealisticRig } from "../character/mirror.ts";
import { heightAt, normalAt, surfaceAt, waterLevel, type CourseTheme, type Hole } from "./course.ts";
import { GolferAnimator, IMPACT_T } from "./golfer.ts";
import type { ClubId, ShotResult } from "./sim.ts";

export type Quality = "high" | "low";

export interface GolfView {
  loadHole(hole: Hole): void;
  /** Place the ball and golfer, aim and club; optional predicted path to draw. */
  setAddress(ball: { x: number; z: number }, aim: number, club: ClubId, preview: number[][] | null): void;
  setGolfer(avatar: AvatarConfig | null): void;
  playShot(result: ShotResult, opts: { power: number; onImpact?: () => void; onLand?: () => void; happy?: boolean }): Promise<void>;
  /** Start the swing immediately; playShot() continues it when the result arrives. */
  beginSwing(power: number): void;
  setQuality(q: Quality): void;
  destroy(): void;
}

export function detectQuality(): Quality {
  if (typeof window === "undefined") return "low";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  return coarse || small ? "low" : "high";
}

function hexColor(h: string) {
  const n = parseInt(h.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255] as const;
}

function stdMat(opts: { color?: string; gloss?: number; metal?: number; map?: pc.Texture; noEnv?: boolean; emissive?: string; clearCoat?: number; opacity?: number }) {
  const m = new pc.StandardMaterial();
  m.useMetalness = true;
  m.metalness = opts.metal ?? 0;
  m.gloss = opts.gloss ?? 0.4;
  if (opts.color) {
    const [r, g, b] = hexColor(opts.color);
    m.diffuse = new pc.Color(r / 255, g / 255, b / 255);
  }
  if (opts.map) m.diffuseMap = opts.map;
  if (opts.emissive) {
    const [r, g, b] = hexColor(opts.emissive);
    m.emissive = new pc.Color(r / 255, g / 255, b / 255);
  }
  if (opts.clearCoat) {
    m.clearCoat = opts.clearCoat;
    m.clearCoatGloss = 0.9;
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

/** Paint the course map: one texel ≈ 0.3 m. */
function paintCourse(hole: Hole, theme: CourseTheme): HTMLCanvasElement {
  const b = hole.bounds;
  const W = b.maxX - b.minX, H = b.maxZ - b.minZ;
  const pw = 512;
  const ph = Math.min(2048, Math.round((pw * H) / W));
  const c = document.createElement("canvas");
  c.width = pw;
  c.height = ph;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(pw, ph);
  const col = {
    fairway: hexColor(theme.grass.fairway),
    rough: hexColor(theme.grass.rough),
    green: hexColor(theme.grass.green),
    fringe: hexColor(theme.grass.fringe),
    tee: hexColor(theme.grass.fairway),
    bunker: hexColor("#e3cf9b"),
    water: hexColor("#1f5566"),
    oob: hexColor(theme.grass.rough),
  } as const;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let py = 0; py < ph; py++) {
    const z = b.minZ + ((py + 0.5) / ph) * H;
    for (let px = 0; px < pw; px++) {
      const x = b.minX + ((px + 0.5) / pw) * W;
      const s = surfaceAt(hole, x, z);
      const base = col[s];
      let shade = 1;
      if (s === "fairway" || s === "tee") shade = Math.floor((z + 1000) / 9) % 2 === 0 ? 1.07 : 0.95; // mowing stripes
      else if (s === "green") shade = Math.floor((x + 1000) / 2.5) % 2 === 0 ? 1.05 : 0.97;
      else if (s === "rough" || s === "oob") shade = 0.88 + rnd() * 0.18;
      else if (s === "bunker") shade = 0.92 + rnd() * 0.12;
      if (s === "oob") shade *= 0.85;
      const n = 0.96 + rnd() * 0.08;
      const i = (py * pw + px) * 4;
      img.data[i] = Math.min(255, base[0] * shade * n);
      img.data[i + 1] = Math.min(255, base[1] * shade * n);
      img.data[i + 2] = Math.min(255, base[2] * shade * n);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export async function createGolfView(canvas: HTMLCanvasElement, theme: CourseTheme, initialQuality: Quality = detectQuality()): Promise<GolfView> {
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
  app.scene.ambientLight = new pc.Color(0.18, 0.2, 0.24);

  // Sky + image-based lighting from a real HDR photograph.
  const envAsset = new pc.Asset(`sky-${theme.id}`, "texture", { url: theme.hdr }, { mipmaps: false });
  app.assets.add(envAsset);
  envAsset.ready(() => {
    try {
      const tex = envAsset.resource as pc.Texture;
      tex.projection = pc.TEXTUREPROJECTION_EQUIRECT;
      app.scene.skybox = pc.EnvLighting.generateSkyboxCubemap(tex);
      const lighting = pc.EnvLighting.generateLightingSource(tex);
      app.scene.envAtlas = pc.EnvLighting.generateAtlas(lighting);
      lighting.destroy();
      app.scene.skyboxIntensity = theme.night ? 0.6 : 1;
    } catch (e) {
      console.warn("[golf] sky unavailable", e);
    }
  });
  app.assets.load(envAsset);

  const sun = new pc.Entity("sun");
  const shadowType = (pc as unknown as Record<string, number>)["SHADOW_PCF3_32F"] ?? (pc as unknown as Record<string, number>)["SHADOW_PCF3"] ?? 0;
  sun.addComponent("light", {
    type: "directional",
    color: new pc.Color(...theme.sunColor),
    intensity: theme.sunIntensity,
    castShadows: true,
    shadowResolution: quality === "high" ? 2048 : 1024,
    shadowDistance: quality === "high" ? 140 : 70,
    numCascades: quality === "high" ? 3 : 1,
    shadowType,
    shadowBias: 0.3,
    normalOffsetBias: 0.06,
  });
  const sd = new pc.Vec3(...theme.sunDir).normalize();
  sun.lookAt(sd);
  sun.rotateLocal(90, 0, 0); // lights shine along their -Y axis
  app.root.addChild(sun);
  if (theme.night) {
    // Floodlights around the green at night.
    app.scene.ambientLight = new pc.Color(0.08, 0.09, 0.14);
  }

  const world = new pc.Entity("course");
  app.root.addChild(world);
  let holeRoot: pc.Entity | null = null;
  let hole: Hole | null = null;

  const mats = {
    trunk: stdMat({ color: "#5a3d26", gloss: 0.2, noEnv: true }),
    pine: stdMat({ color: "#24502b", gloss: 0.15, noEnv: true }),
    leaf: stdMat({ color: "#3d7a2e", gloss: 0.15, noEnv: true }),
    leaf2: stdMat({ color: "#4f8f36", gloss: 0.15, noEnv: true }),
    palm: stdMat({ color: "#4f9a3a", gloss: 0.2, noEnv: true }),
    water: stdMat({ color: "#16465a", gloss: 0.95, clearCoat: 1, opacity: 0.88 }),
    pole: stdMat({ color: "#f4f4f4", gloss: 0.6 }),
    flag: stdMat({ color: theme.night ? "#ff7a1a" : "#e11d48", gloss: 0.3, emissive: theme.night ? "#ff7a1a" : "#000000" }),
    cup: stdMat({ color: "#050505", gloss: 0.1, noEnv: true }),
    tee: stdMat({ color: "#2f7bff", gloss: 0.6 }),
    ball: stdMat({ color: "#ffffff", gloss: 0.75, clearCoat: 1 }),
    shaft: stdMat({ color: "#c9ccd2", metal: 1, gloss: 0.8 }),
    head: stdMat({ color: "#2a2d33", metal: 0.8, gloss: 0.7 }),
    grip: stdMat({ color: "#111111", gloss: 0.2 }),
  };

  const add = (parent: pc.Entity, type: string, mat: pc.Material, pos: [number, number, number], scale: [number, number, number], shadows = true) => {
    const e = new pc.Entity();
    e.addComponent("render", { type, material: mat, castShadows: shadows, receiveShadows: true });
    e.setLocalPosition(...pos);
    e.setLocalScale(scale[0], type === "capsule" ? scale[1] / 2 : scale[1], scale[2]);
    parent.addChild(e);
    return e;
  };

  // Ball (drawn at 1.8× real size so it stays visible on screen) and golfer.
  const ball = add(app.root, "sphere", mats.ball, [0, 0, 0], [0.077, 0.077, 0.077], true);
  const golferH = createHumanoid(app.root, null, { shadows: true });
  const golfer = new GolferAnimator(golferH, { shaft: mats.shaft, head: mats.head, grip: mats.grip });
  const golferReal = new RealisticRig(app, golferH, null, { grip: [0.85, 0.85] });

  // Camera.
  const camera = new pc.Entity("camera");
  camera.addComponent("camera", { fov: 55, nearClip: 0.1, farClip: 2500, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB });
  app.root.addChild(camera);
  const camPos = new pc.Vec3(0, 60, -200);
  const camTarget = new pc.Vec3(0, 0, 0);
  const desiredPos = new pc.Vec3();
  const desiredTarget = new pc.Vec3();
  let camRate = 1.2;

  let address = { x: 0, z: 0, aim: 0, club: "driver" as ClubId };
  let preview: number[][] | null = null;
  let playback: { result: ShotResult; t: number; started: boolean; resolve: () => void; onLand?: () => void; landed: boolean; endWait: number; happy: boolean } | null = null;
  const tracer: pc.Vec3[] = [];
  let earlySwing = false;

  const placeGolfer = () => {
    if (!hole) return;
    const fx = Math.cos(address.aim), fz = Math.sin(address.aim); // golfer faces across the target line
    const stance = address.club === "putter" ? 0.55 : address.club === "driver" ? 0.9 : 0.78;
    const gx = address.x - fx * stance, gz = address.z - fz * stance;
    golferH.root.setPosition(gx, heightAt(hole, gx, gz), gz);
    golferH.root.setEulerAngles(0, (Math.atan2(-fx, -fz) * 180) / Math.PI, 0);
  };

  const ballY = (x: number, z: number) => (hole ? heightAt(hole, x, z) : 0) + 0.035;

  const buildHole = (h: Hole) => {
    holeRoot?.destroy();
    holeRoot = new pc.Entity("hole");
    world.addChild(holeRoot);
    const b = h.bounds;
    const W = b.maxX - b.minX, H = b.maxZ - b.minZ;
    // Terrain mesh.
    const cell = quality === "high" ? 2 : 3;
    const nx = Math.ceil(W / cell) + 1, nz = Math.ceil(H / cell) + 1;
    const pos: number[] = [], nor: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j < nz; j++) {
      const z = b.minZ + (j / (nz - 1)) * H;
      for (let i = 0; i < nx; i++) {
        const x = b.minX + (i / (nx - 1)) * W;
        pos.push(x, heightAt(h, x, z), z);
        const n = normalAt(h, x, z);
        nor.push(n[0], n[1], n[2]);
        uv.push(i / (nx - 1), j / (nz - 1)); // canvas row 0 = minZ
      }
    }
    for (let j = 0; j < nz - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i, c = a + 1, bb = a + nx, d = bb + 1;
        idx.push(a, bb, c, c, bb, d);
      }
    }
    const mesh = new pc.Mesh(device);
    mesh.setPositions(pos);
    mesh.setNormals(nor);
    mesh.setUvs(0, uv);
    mesh.setIndices(idx);
    mesh.update(pc.PRIMITIVE_TRIANGLES);
    const mapCanvas = paintCourse(h, theme);
    const tex = new pc.Texture(device, { width: mapCanvas.width, height: mapCanvas.height, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR });
    tex.setSource(mapCanvas);
    tex.anisotropy = 8;
    const groundMat = stdMat({ map: tex, gloss: 0.18 });
    const ground = new pc.Entity("terrain");
    ground.addComponent("render", { meshInstances: [new pc.MeshInstance(mesh, groundMat)], castShadows: false, receiveShadows: true });
    holeRoot.addChild(ground);
    // Surrounding land so the horizon isn't empty.
    add(holeRoot, "box", stdMat({ color: theme.grass.rough, gloss: 0.1, noEnv: true }), [(b.minX + b.maxX) / 2, -1.6, (b.minZ + b.maxZ) / 2], [W + 1600, 0.5, H + 1600], false);

    for (const w of h.water) add(holeRoot, "cylinder", mats.water, [w.x, waterLevel(h, w), w.z], [w.r * 2.2, 0.02, w.r * 2.2], false);
    // Trees.
    const treeLimit = quality === "high" ? h.trees.length : Math.ceil(h.trees.length / 2);
    for (const t of h.trees.slice(0, treeLimit)) {
      const y = heightAt(h, t.x, t.z);
      const g = new pc.Entity("tree");
      g.setLocalPosition(t.x, y, t.z);
      holeRoot.addChild(g);
      if (theme.id === "oceanfront" && t.kind === 2) {
        add(g, "cylinder", mats.trunk, [0, t.h * 0.5, 0], [0.35, t.h, 0.35]);
        for (let k = 0; k < 6; k++) {
          const leaf = add(g, "cone", mats.palm, [0, t.h, 0], [0.9, 3.4, 0.4]);
          leaf.setLocalEulerAngles(70, k * 60, 0);
        }
      } else if (t.kind === 0) {
        add(g, "cylinder", mats.trunk, [0, 1.2, 0], [0.4, 2.4, 0.4]);
        add(g, "cone", mats.pine, [0, t.h * 0.45, 0], [t.h * 0.42, t.h * 0.6, t.h * 0.42]);
        add(g, "cone", mats.pine, [0, t.h * 0.72, 0], [t.h * 0.3, t.h * 0.45, t.h * 0.3]);
      } else {
        add(g, "cylinder", mats.trunk, [0, t.h * 0.3, 0], [0.5, t.h * 0.6, 0.5]);
        add(g, "sphere", t.kind === 1 ? mats.leaf : mats.leaf2, [0, t.h * 0.68, 0], [t.h * 0.55, t.h * 0.5, t.h * 0.55]);
        add(g, "sphere", mats.leaf2, [t.h * 0.15, t.h * 0.58, -t.h * 0.1], [t.h * 0.38, t.h * 0.34, t.h * 0.38]);
      }
    }
    // Cup, flag pin and tee markers.
    const cy = heightAt(h, h.cup.x, h.cup.z);
    add(holeRoot, "cylinder", mats.cup, [h.cup.x, cy + 0.004, h.cup.z], [0.108, 0.006, 0.108], false);
    add(holeRoot, "cylinder", mats.pole, [h.cup.x, cy + 1.1, h.cup.z], [0.025, 2.2, 0.025]);
    add(holeRoot, "box", mats.flag, [h.cup.x + 0.27, cy + 1.95, h.cup.z], [0.5, 0.34, 0.01]);
    for (const sx of [-2.5, 2.5]) add(holeRoot, "sphere", mats.tee, [sx, heightAt(h, sx, -1) + 0.07, -1], [0.14, 0.14, 0.14]);
    if (theme.night) {
      // Floodlight over the green.
      const fl = new pc.Entity("floodlight");
      fl.addComponent("light", { type: "spot", color: new pc.Color(1, 0.95, 0.85), intensity: 4, range: 60, innerConeAngle: 30, outerConeAngle: 55, castShadows: false });
      fl.setLocalPosition(h.green.x, cy + 25, h.green.z + 8);
      fl.lookAt(h.green.x, cy, h.green.z);
      fl.rotateLocal(90, 0, 0);
      holeRoot.addChild(fl);
    }
    // Intro: start high above the green, then swoop to the tee.
    camPos.set(h.green.x, cy + 55, h.green.z + 40);
    camTarget.set(0, 0, 0);
    camRate = 0.9;
  };

  const addressCamera = () => {
    const ax = Math.sin(address.aim), az = -Math.cos(address.aim);
    const putt = address.club === "putter";
    const back = putt ? 3.2 : 6.5;
    const up = putt ? 1.3 : 2.3;
    const by = ballY(address.x, address.z);
    desiredPos.set(address.x - ax * back, by + up, address.z - az * back);
    desiredTarget.set(address.x + ax * (putt ? 8 : 45), by + (putt ? 0 : 3), address.z + az * (putt ? 8 : 45));
  };

  const ringPoints = (x: number, y: number, z: number, r: number) => {
    const pts: pc.Vec3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      pts.push(new pc.Vec3(x + Math.cos(a) * r, y, z + Math.sin(a) * r));
    }
    return pts;
  };
  const white = new pc.Color(1, 1, 1, 1);
  const gold = new pc.Color(1, 0.8, 0.2, 1);
  const tracerColor = new pc.Color(1, 0.55, 0.15, 1);
  const v1 = new pc.Vec3(), v2 = new pc.Vec3();

  app.on("update", (dt: number) => {
    golfer.update(dt);
    golferReal.update();
    if (playback && playback.started) {
      const { result } = playback;
      playback.t += dt;
      const fi = playback.t * result.fps;
      const i = Math.min(result.frames.length - 1, Math.floor(fi));
      const a = fi - i;
      const f = result.frames[i]!, g = result.frames[i + 1] ?? f;
      const x = f[0]! + (g[0]! - f[0]!) * a, y = f[1]! + (g[1]! - f[1]!) * a, z = f[2]! + (g[2]! - f[2]!) * a;
      ball.setPosition(x, y + 0.015, z);
      const last = tracer[tracer.length - 1];
      if (!last || last.distance(ball.getPosition()) > 0.6) tracer.push(ball.getPosition().clone());
      if (!playback.landed && result.landFrame >= 0 && i >= result.landFrame) {
        playback.landed = true;
        playback.onLand?.();
      }
      // Camera: watch from behind the golfer, then chase the ball.
      const ax = Math.sin(address.aim), az = -Math.cos(address.aim);
      if (address.club === "putter") {
        desiredTarget.set(x, y, z);
        camRate = 3;
      } else if (playback.t < 1.1) {
        desiredTarget.set(x, y, z);
        camRate = 4;
      } else {
        const prev = result.frames[Math.max(0, i - 6)]!;
        let dx = x - prev[0]!, dz = z - prev[2]!;
        const dl = Math.hypot(dx, dz);
        if (dl < 0.5) { dx = ax; dz = az; } else { dx /= dl; dz /= dl; }
        const airborne = !playback.landed;
        desiredPos.set(x - dx * (airborne ? 22 : 12), y + (airborne ? 7 : 4), z - dz * (airborne ? 22 : 12));
        desiredTarget.set(x, y, z);
        camRate = 2.2;
      }
      if (i >= result.frames.length - 1) {
        playback.endWait += dt;
        if (playback.endWait > 1.4) {
          const done = playback.resolve;
          if (result.outcome === "holed") ball.enabled = false;
          playback = null;
          done();
        } else if (playback.endWait < dt * 1.5) {
          golfer.react(playback.happy);
        }
      }
    }
    // Draw tracer and preview.
    for (let k = 1; k < tracer.length; k++) app.drawLine(tracer[k - 1]!, tracer[k]!, tracerColor, false);
    if (preview && !playback) {
      for (let k = 2; k < preview.length; k += 2) {
        const p = preview[k - 1]!, q = preview[k]!;
        v1.set(p[0]!, p[1]! + 0.03, p[2]!);
        v2.set(q[0]!, q[1]! + 0.03, q[2]!);
        app.drawLine(v1, v2, white, false);
      }
      const end = preview[preview.length - 1];
      if (end) {
        const pts = ringPoints(end[0]!, end[1]! + 0.05, end[2]!, address.club === "putter" ? 0.25 : 3);
        for (let k = 1; k < pts.length; k++) app.drawLine(pts[k - 1]!, pts[k]!, gold, false);
      }
    }
    const k = 1 - Math.exp(-dt * camRate);
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

  return {
    loadHole(h) {
      hole = h;
      buildHole(h);
      ball.enabled = true;
      tracer.length = 0;
    },
    setAddress(b, aim, club, prev) {
      address = { x: b.x, z: b.z, aim, club };
      preview = prev;
      ball.enabled = true;
      ball.setPosition(b.x, ballY(b.x, b.z), b.z);
      golfer.setClub(club);
      placeGolfer();
      golfer.holdAtTop = false;
      earlySwing = false;
      golfer.address();
      addressCamera();
      if (!playback) tracer.length = 0;
      if (camRate > 1.5) camRate = 1.6;
    },
    setGolfer(avatar) {
      golferH.apply(avatar);
      golferReal.setLook(avatar);
    },
    beginSwing(power) {
      preview = null;
      golfer.onImpact = null;
      golfer.holdAtTop = true;
      golfer.swing(power);
      earlySwing = true;
    },
    playShot(result, opts) {
      preview = null;
      tracer.length = 0;
      const continuing = earlySwing && golfer.swinging;
      earlySwing = false;
      golfer.holdAtTop = false;
      return new Promise<void>((resolve) => {
        const pb = { result, t: 0, started: false, resolve, landed: false, endWait: 0, happy: !!opts.happy, ...(opts.onLand ? { onLand: opts.onLand } : {}) };
        playback = pb;
        golfer.onImpact = () => {
          pb.started = true;
          opts.onImpact?.();
        };
        if (!continuing) golfer.swing(opts.power);
        void IMPACT_T;
      });
    },
    setQuality(q) {
      if (q === quality) return;
      quality = q;
      device.maxPixelRatio = q === "high" ? Math.min(window.devicePixelRatio, 2) : Math.min(window.devicePixelRatio, 1.25);
      if (hole) buildHole(hole);
      resize();
    },
    destroy() {
      golferReal.destroy();
      ro.disconnect();
      app.destroy();
    },
  };
}
