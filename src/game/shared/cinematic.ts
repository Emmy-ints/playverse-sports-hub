/**
 * Shared "broadcast look" for every sport: PlayCanvas CameraFrame post-processing — MSAA, ambient
 * occlusion (contact shadows), subtle bloom on bright highlights, colour grading and a soft
 * vignette. High quality on desktops; a cheaper chain on phones. Fails safe if the engine build
 * lacks a feature.
 */
import * as pc from "playcanvas";

export interface CinematicOptions {
  bloom?: number; // 0..1 strength (very small values look natural)
  ssao?: boolean;
  saturation?: number;
  contrast?: number;
  brightness?: number;
  vignette?: number;
}

type Rec = Record<string, unknown>;

export function applyCinematic(app: pc.AppBase, camera: pc.CameraComponent, quality: "high" | "low", o: CinematicOptions = {}) {
  let frame: (Rec & { update: () => void; destroy?: () => void; rendering: Rec; bloom: Rec; ssao: Rec; grading: Rec; vignette: Rec }) | null = null;
  try {
    const CF = (pc as unknown as Rec)["CameraFrame"] as (new (a: pc.AppBase, c: pc.CameraComponent) => NonNullable<typeof frame>) | undefined;
    if (!CF) return { destroy() {} };
    const f = new CF(app, camera);
    const set = (group: Rec | undefined, key: string, value: unknown) => {
      if (group && key in group) group[key] = value;
    };
    set(f.rendering, "toneMapping", pc.TONEMAP_ACES);
    set(f.rendering, "samples", quality === "high" ? 4 : 2);
    set(f.rendering, "renderTargetScale", quality === "high" ? 1 : 0.85);
    set(f.rendering, "sharpness", quality === "high" ? 0.25 : 0.4);
    if (quality === "high" && o.ssao !== false) {
      const combine = (pc as unknown as Rec)["SSAOTYPE_COMBINE"] ?? "combine";
      set(f.ssao, "type", combine);
      set(f.ssao, "intensity", 0.45);
      set(f.ssao, "radius", 0.9);
      set(f.ssao, "samples", 12);
      set(f.ssao, "power", 6);
      set(f.ssao, "blurEnabled", true);
    }
    set(f.bloom, "intensity", quality === "high" ? (o.bloom ?? 0.006) : 0);
    set(f.bloom, "blurLevel", 14);
    set(f.grading, "enabled", true);
    set(f.grading, "saturation", o.saturation ?? 1.08);
    set(f.grading, "contrast", o.contrast ?? 1.06);
    set(f.grading, "brightness", o.brightness ?? 1.0);
    set(f.vignette, "intensity", o.vignette ?? 0.35);
    set(f.vignette, "inner", 0.55);
    set(f.vignette, "outer", 1.25);
    set(f.vignette, "curvature", 0.6);
    f.update();
    frame = f;
  } catch (e) {
    console.warn("[cinematic] post-processing unavailable", e);
    frame = null;
  }
  return {
    destroy() {
      try {
        frame?.destroy?.();
      } catch {
        /* ignore */
      }
      frame = null;
    },
  };
}
