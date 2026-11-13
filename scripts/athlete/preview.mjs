// Tiny software rasterizer for previewing meshes as PNG (orthographic, z-buffer, lambert + rim).
import fs from "node:fs";
import { V, Q, encodePng } from "./lib.mjs";

/** meshes: [{pos:[[x,y,z]], tris:[[a,b,c]], color:[r,g,b] | (i)=>[r,g,b]}] ; views: [{yaw (deg), pitch}] */
export function renderViews(meshes, views, { w = 360, h = 640, center = [0, 0.9, 0], height = 2.0, file }) {
  const W = w * views.length;
  const img = new Uint8Array(W * h * 3).fill(0);
  for (let i = 0; i < W * h; i++) {
    const y = Math.floor(i / W);
    const g = 40 + (y / h) * 30;
    img[i * 3] = g;
    img[i * 3 + 1] = g + 4;
    img[i * 3 + 2] = g + 10;
  }
  views.forEach((view, vi) => {
    const zb = new Float32Array(w * h).fill(-Infinity);
    const q = Q.mul(Q.euler("X", view.pitch || 0), Q.euler("Y", view.yaw || 0));
    const scale = h / (view.height || height);
    const cen = view.center || center;
    const light = V.norm([0.4, 0.8, 0.6]);
    for (const m of meshes) {
      const P = m.pos.map((p) => {
        const r = Q.rot(q, V.sub(p, cen));
        return [w / 2 + r[0] * scale, h / 2 - r[1] * scale, r[2]];
      });
      const N = m.pos.map(() => null);
      for (const t of m.tris) {
        const [a, b, c] = t.map((i) => P[i]);
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (!m.doubleSided && area >= 0) continue; // back-face (ccw front in screen with y down)
        const wn = V.norm(V.cross(V.sub(m.pos[t[1]], m.pos[t[0]]), V.sub(m.pos[t[2]], m.pos[t[0]])));
        const vn = Q.rot(q, wn);
        let lam = Math.max(0, V.dot(Q.rot(q, light), vn)) * 0.75 + 0.25;
        const rim = Math.pow(1 - Math.abs(vn[2]), 3) * 0.25;
        const minX = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
        const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
        const minY = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
        const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
        const cols = t.map((i) => (typeof m.color === "function" ? m.color(i) : m.color));
        for (let y = minY; y <= maxY; y++)
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((b[0] - px) * (c[1] - py) - (b[1] - py) * (c[0] - px)) / area;
            const w1 = ((c[0] - px) * (a[1] - py) - (c[1] - py) * (a[0] - px)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = a[2] * w0 + b[2] * w1 + c[2] * w2;
            if (z <= zb[y * w + x]) continue;
            zb[y * w + x] = z;
            const o = (y * W + x + vi * w) * 3;
            for (let k = 0; k < 3; k++) {
              const col = cols[0][k] * w0 + cols[1][k] * w1 + cols[2][k] * w2;
              img[o + k] = Math.min(255, Math.max(0, (col * lam + rim) * 255));
            }
          }
      }
    }
  });
  fs.writeFileSync(file, encodePng(W, h, img, 3));
}
