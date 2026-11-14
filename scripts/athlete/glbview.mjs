// Render selected mesh nodes of an athlete GLB in rest pose.
import fs from "node:fs";
import { renderViews } from "./preview.mjs";
const [file, out, ...names] = process.argv.slice(2);
const b = fs.readFileSync(file);
const jl = b.readUInt32LE(12);
const j = JSON.parse(b.subarray(20, 20 + jl));
const bin = b.subarray(28 + jl);
const acc = (i) => {
  const a = j.accessors[i], v = j.bufferViews[a.bufferView];
  const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const C = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array }[a.componentType];
  const arr = new C(bin.buffer.slice(bin.byteOffset + v.byteOffset, bin.byteOffset + v.byteOffset + v.byteLength));
  const res = [];
  for (let k = 0; k < a.count; k++) res.push(n === 1 ? arr[k] : Array.from(arr.slice(k * n, k * n + n)));
  return res;
};
const COL = { skin: [0.75, 0.55, 0.42], kit_top: [0.2, 0.5, 0.9], kit_bottom: [0.15, 0.17, 0.25], shoe: [0.9, 0.4, 0.1], sole: [0.95, 0.95, 0.95], socks: [1, 1, 1], hair: [0.1, 0.07, 0.05], eyes: [0.9, 0.9, 0.9], glasses: [0.05, 0.05, 0.05], accessory: [0.9, 0.9, 0.9] };
const meshes = [];
for (const n of j.nodes) {
  if (n.mesh === undefined || !names.includes(n.name)) continue;
  for (const p of j.meshes[n.mesh].primitives) {
    const pos = acc(p.attributes.POSITION);
    const idx = acc(p.indices);
    const tris = [];
    for (let k = 0; k < idx.length; k += 3) tris.push([idx[k], idx[k + 1], idx[k + 2]]);
    const mname = j.materials[p.material].name;
    const colv = p.attributes.COLOR_0 !== undefined ? acc(p.attributes.COLOR_0) : null;
    const base = COL[mname] || [0.5, 0.5, 0.5];
    meshes.push({ pos, tris, doubleSided: true, color: colv ? (i) => colv[i].slice(0, 3).map((x, k) => (x / 255) * base[k]) : base });
  }
}
const H = 1.75;
renderViews(meshes, [{ yaw: 180 }, { yaw: 120 }, { yaw: 0 }, { yaw: 160, center: [0, H - 0.08, 0.05], height: 0.35 }, { yaw: 120, center: [0.05, 0.08, 0.05], height: 0.3 }], { file: out, w: 260, h: 480, center: [0, 0.98, 0], height: 2.05 });
