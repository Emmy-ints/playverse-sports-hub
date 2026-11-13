/**
 * Procedural PBR detail maps (no downloads): tileable noise → normal map + roughness variation,
 * tuned per material (grass blades, clay grains, acrylic court sand, asphalt aggregate, wood grain,
 * fabric). Applied on top of the existing colour maps with their own tiling, which removes the flat
 * plastic look of untextured surfaces.
 */
import * as pc from "playcanvas";

export type SurfaceKind = "grass" | "clay" | "acrylic" | "asphalt" | "wood" | "fabric" | "sand" | "concrete" | "water";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/** Tileable value noise with octaves, returns a size×size height field 0..1. */
function heightField(size: number, kind: SurfaceKind, seed: number): Float32Array {
  const h = new Float32Array(size * size);
  const r = rng(seed);
  const octave = (cells: number, amp: number, stretchX = 1, stretchY = 1) => {
    const cx = Math.max(1, Math.round(cells * stretchX)), cy = Math.max(1, Math.round(cells * stretchY));
    const g = new Float32Array(cx * cy).map(() => r());
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cy, y0 = Math.floor(fy), ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cx, x0 = Math.floor(fx), tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const a = g[(y0 % cy) * cx + (x0 % cx)]!, b = g[(y0 % cy) * cx + ((x0 + 1) % cx)]!;
        const c = g[((y0 + 1) % cy) * cx + (x0 % cx)]!, d = g[((y0 + 1) % cy) * cx + ((x0 + 1) % cx)]!;
        h[y * size + x]! += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
      }
    }
  };
  switch (kind) {
    case "grass": // fine blades running along one axis
      octave(64, 0.5, 0.25, 4); octave(128, 0.35, 0.3, 3); octave(16, 0.15); break;
    case "wood": // long grain
      octave(8, 0.45, 0.05, 2); octave(64, 0.35, 0.03, 4); octave(256, 0.2, 0.1, 1); break;
    case "fabric": // weave
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = 0.5 + 0.25 * Math.sin((x / size) * Math.PI * 2 * 48) * Math.sin((y / size) * Math.PI * 2 * 48);
      octave(64, 0.2); break;
    case "water":
      octave(8, 0.5, 1, 0.6); octave(24, 0.3, 1, 0.5); octave(64, 0.2); break;
    case "asphalt":
      octave(128, 0.5); octave(64, 0.3); octave(16, 0.2); break;
    case "clay":
      octave(128, 0.55); octave(32, 0.25); octave(8, 0.2); break;
    case "sand":
      octave(128, 0.6); octave(16, 0.4); break;
    default:
      octave(96, 0.5); octave(24, 0.3); octave(6, 0.2);
  }
  // Grains / stones as sharp speckles.
  if (kind === "asphalt" || kind === "clay" || kind === "acrylic" || kind === "concrete") {
    const n = kind === "asphalt" ? size * 6 : size * 3;
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * size), y = Math.floor(r() * size);
      h[y * size + x] = Math.min(1.5, h[y * size + x]! + 0.4 + r() * 0.4);
    }
  }
  return h;
}

const STRENGTH: Record<SurfaceKind, number> = { grass: 2.2, clay: 1.8, acrylic: 1.1, asphalt: 2.6, wood: 0.9, fabric: 1.4, sand: 1.6, concrete: 1.5, water: 1.2 };

const cache = new Map<string, { normal: pc.Texture; gloss: pc.Texture }>();

/** Normal map + gloss map pair for a surface type (cached per device). */
export function surfaceMaps(device: pc.GraphicsDevice, kind: SurfaceKind, quality: "high" | "low" = "high") {
  const key = `${kind}:${quality}`;
  const hit = cache.get(key);
  if (hit && !(hit.normal as unknown as { _destroyed?: boolean })._destroyed && hit.normal.device === device) return hit;
  const size = quality === "high" ? 512 : 256;
  const h = heightField(size, kind, kind.length * 7919);
  const nc = document.createElement("canvas");
  nc.width = nc.height = size;
  const gc = document.createElement("canvas");
  gc.width = gc.height = size;
  const nctx = nc.getContext("2d")!, gctx = gc.getContext("2d")!;
  const ni = nctx.createImageData(size, size), gi = gctx.createImageData(size, size);
  const k = STRENGTH[kind];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const at = (xx: number, yy: number) => h[((yy + size) % size) * size + ((xx + size) % size)]!;
      const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      ni.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      ni.data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      ni.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      ni.data[i + 3] = 255;
      const g = Math.max(0, Math.min(255, 128 + (at(x, y) - 0.5) * 120));
      gi.data[i] = gi.data[i + 1] = gi.data[i + 2] = g;
      gi.data[i + 3] = 255;
    }
  }
  nctx.putImageData(ni, 0, 0);
  gctx.putImageData(gi, 0, 0);
  const tex = (c: HTMLCanvasElement, linear: boolean) => {
    const t = new pc.Texture(device, { width: size, height: size, format: pc.PIXELFORMAT_RGBA8, mipmaps: true, minFilter: pc.FILTER_LINEAR_MIPMAP_LINEAR, magFilter: pc.FILTER_LINEAR, ...(linear ? {} : {}) });
    t.setSource(c);
    t.addressU = pc.ADDRESS_REPEAT;
    t.addressV = pc.ADDRESS_REPEAT;
    t.anisotropy = 8;
    return t;
  };
  const out = { normal: tex(nc, true), gloss: tex(gc, true) };
  cache.set(key, out);
  return out;
}

/** Add detail normals/gloss to a StandardMaterial with its own tiling (repeats per UV unit). */
export function addSurfaceDetail(m: pc.StandardMaterial, device: pc.GraphicsDevice, kind: SurfaceKind, tiling: [number, number], quality: "high" | "low" = "high", bumpiness = 1) {
  const maps = surfaceMaps(device, kind, quality);
  m.normalMap = maps.normal;
  m.normalMapTiling = new pc.Vec2(tiling[0], tiling[1]);
  m.bumpiness = bumpiness;
  if (kind !== "wood" && kind !== "water") {
    m.glossMap = maps.gloss;
    m.glossMapTiling = new pc.Vec2(tiling[0], tiling[1]);
    m.glossMapChannel = "r";
    m.gloss = Math.min(1, m.gloss * 1.6); // the map averages ~0.5
  }
  m.update();
  return m;
}
