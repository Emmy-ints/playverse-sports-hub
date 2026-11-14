/**
 * Small 3D stage for showing a player's realistic athlete (character creator, profile, lobby).
 * Transparent background, soft studio lighting, a calm standing idle, drag to turn, tap to celebrate.
 */
import * as pc from "playcanvas";
import type { AvatarConfig } from "@/lib/avatar";
import { Athlete, athleteBody, loadAthleteAssets, type AthleteAssets, type Clip } from "./athlete.ts";

export interface AvatarViewer {
  set(config: AvatarConfig): void;
  celebrate(): void;
  destroy(): void;
}

export async function createAvatarViewer(canvas: HTMLCanvasElement, config: AvatarConfig, opts: { interactive?: boolean } = {}): Promise<AvatarViewer> {
  const app = new pc.Application(canvas, { graphicsDeviceOptions: { alpha: true, antialias: true, preserveDrawingBuffer: false } });
  app.setCanvasFillMode(pc.FILLMODE_NONE);
  app.setCanvasResolution(pc.RESOLUTION_AUTO);
  const device = app.graphicsDevice;
  device.maxPixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  app.scene.ambientLight = new pc.Color(0.42, 0.45, 0.52);
  app.scene.exposure = 1.1;

  const camera = new pc.Entity("cam");
  camera.addComponent("camera", { clearColor: new pc.Color(0, 0, 0, 0), fov: 26, nearClip: 0.1, farClip: 30, toneMapping: pc.TONEMAP_ACES, gammaCorrection: pc.GAMMA_SRGB });
  camera.setPosition(0, 1.0, 4.35);
  camera.lookAt(0, 0.9, 0);
  app.root.addChild(camera);
  const key = new pc.Entity();
  key.addComponent("light", { type: "directional", color: new pc.Color(1, 0.96, 0.9), intensity: 1.7, castShadows: true, shadowResolution: 1024, shadowDistance: 6, normalOffsetBias: 0.05, shadowBias: 0.2 });
  key.setEulerAngles(50, 30, 0);
  app.root.addChild(key);
  const rim = new pc.Entity();
  rim.addComponent("light", { type: "directional", color: new pc.Color(0.55, 0.75, 1), intensity: 1.1, castShadows: false });
  rim.setEulerAngles(-160, -40, 0);
  app.root.addChild(rim);
  // soft contact shadow under the feet
  const shadowMat = new pc.StandardMaterial();
  shadowMat.diffuse = new pc.Color(0, 0, 0);
  shadowMat.opacity = 0.35;
  shadowMat.blendType = pc.BLEND_NORMAL;
  shadowMat.depthWrite = false;
  shadowMat.useLighting = false;
  shadowMat.update();
  const blob = new pc.Entity();
  blob.addComponent("render", { type: "cylinder", material: shadowMat, castShadows: false });
  blob.setLocalScale(0.9, 0.002, 0.55);
  app.root.addChild(blob);

  const resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h) app.resizeCanvas(w, h);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  app.start();

  let assets: AthleteAssets;
  try {
    assets = await loadAthleteAssets(app);
  } catch (e) {
    ro.disconnect();
    app.destroy();
    throw e;
  }
  const stand = assets.clips["stand"] ?? assets.clips["idle"]!;
  const cheer = assets.clips["cheer"]!;
  let cfg = config;
  let ath = new Athlete(assets, app.root, cfg, { shadows: true });
  let yaw = 180 + 18; // face the camera, turned slightly
  let t = 0;
  let action: { clip: Clip; t: number } | null = null;
  let dragging = false;
  let lastX = 0;

  app.on("update", (dt: number) => {
    t += dt;
    if (!dragging) yaw += (198 - yaw) * Math.min(1, dt * 0.6); // drift back to the front
    ath.root.setEulerAngles(0, yaw, 0);
    const layers = [{ clip: stand, time: t, weight: 1 }];
    if (action) {
      action.t += dt;
      const w = Math.min(1, action.t / 0.25, (action.clip.duration - action.t) / 0.4);
      if (action.t >= action.clip.duration) action = null;
      else layers.push({ clip: action.clip, time: action.t, weight: Math.max(0, w) });
    }
    ath.pose(layers);
  });

  // Drag to turn the character.
  const down = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
  };
  const move = (e: PointerEvent) => {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.6;
    lastX = e.clientX;
  };
  const up = () => (dragging = false);
  if (opts.interactive) {
    canvas.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return {
    set(next) {
      cfg = next;
      if (athleteBody(next) !== ath.body) {
        ath.destroy();
        ath = new Athlete(assets, app.root, next, { shadows: true });
      } else ath.apply(next);
    },
    celebrate() {
      action = { clip: cheer, t: 0.3 };
    },
    destroy() {
      canvas.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      ro.disconnect();
      app.destroy();
    },
  };
}
