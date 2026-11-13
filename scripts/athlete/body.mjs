// Builds a realistic athlete body (mesh, skeleton, skin weights, kit, hair, eyes) from MakeHuman CC0 data.
import fs from "node:fs";
import { V } from "./lib.mjs";

export const MH = "/home/claude/assets-src/mh/makehuman/data";
const S = 0.1; // MakeHuman decimetres -> metres

export function loadObj(file) {
  const v = [], vt = [], faces = [];
  let g = "";
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (line.startsWith("v ")) v.push(line.split(/\s+/).slice(1, 4).map(Number));
    else if (line.startsWith("vt ")) vt.push(line.split(/\s+/).slice(1, 3).map(Number));
    else if (line.startsWith("g ")) g = line.slice(2).trim();
    else if (line.startsWith("f ")) {
      const parts = line.trim().split(/\s+/).slice(1);
      faces.push({ g, vi: parts.map((p) => Number(p.split("/")[0]) - 1), ti: parts.map((p) => Number(p.split("/")[1] || 0) - 1) });
    }
  }
  return { v, vt, faces };
}

function loadTarget(rel) {
  const m = [];
  for (const line of fs.readFileSync(`${MH}/targets/${rel}`, "utf8").split("\n")) {
    if (!line || line[0] === "#") continue;
    const p = line.trim().split(/\s+/);
    if (p.length < 4) continue;
    m.push([Number(p[0]), Number(p[1]), Number(p[2]), Number(p[3])]);
  }
  return m;
}

/** Macro modifiers in MakeHuman's own weighting scheme. gender 0..1 (1 male), muscle 0..1, height 0..1. */
export function morphWeights({ gender, muscle, height, proportions = 1 }) {
  const out = [];
  const genders = [["male", gender], ["female", 1 - gender]];
  const muscles = muscle >= 0.5 ? [["averagemuscle", 1 - (muscle - 0.5) * 2], ["maxmuscle", (muscle - 0.5) * 2]] : [["averagemuscle", muscle * 2]];
  for (const [g, gw] of genders) {
    if (gw <= 0) continue;
    for (const [m, mw] of muscles) {
      if (mw <= 0) continue;
      out.push([`macrodetails/universal-${g}-young-${m}-averageweight.target`, gw * mw]);
      if (height > 0.5) out.push([`macrodetails/height/${g}-young-${m}-averageweight-maxheight.target`, gw * mw * (height - 0.5) * 2]);
      else if (height < 0.5) out.push([`macrodetails/height/${g}-young-${m}-averageweight-minheight.target`, gw * mw * (0.5 - height) * 2]);
      out.push([`macrodetails/proportions/${g}-young-${m}-averageweight-idealproportions.target`, gw * mw * proportions]);
    }
    for (const e of ["african", "asian", "caucasian"]) out.push([`macrodetails/${e}-${g}-young.target`, gw / 3]);
  }
  return out;
}

// Reduced skeleton: body, arms and fingers. Facial, breast and toe bones are merged into their parents.
export const KEEP = [
  "root", "spine05", "spine04", "spine03", "spine02", "spine01", "neck01", "neck02", "neck03", "head",
  ...["L", "R"].flatMap((s) => [
    `pelvis.${s}`, `upperleg01.${s}`, `upperleg02.${s}`, `lowerleg01.${s}`, `lowerleg02.${s}`, `foot.${s}`, `toe1-1.${s}`,
    `clavicle.${s}`, `shoulder01.${s}`, `upperarm01.${s}`, `upperarm02.${s}`, `lowerarm01.${s}`, `lowerarm02.${s}`, `wrist.${s}`,
    `finger1-1.${s}`, `finger1-2.${s}`, `finger1-3.${s}`,
    ...[1, 2, 3, 4].flatMap((m) => [`metacarpal${m}.${s}`, `finger${m + 1}-1.${s}`, `finger${m + 1}-2.${s}`, `finger${m + 1}-3.${s}`]),
  ]),
];

export function buildBody(params) {
  const obj = loadObj(`${MH}/3dobjs/base.obj`);
  const v = obj.v.map((p) => p.slice());
  for (const [t, w] of morphWeights(params)) {
    if (w <= 1e-4) continue;
    for (const [i, dx, dy, dz] of loadTarget(t)) {
      v[i][0] += dx * w;
      v[i][1] += dy * w;
      v[i][2] += dz * w;
    }
  }
  const skel = JSON.parse(fs.readFileSync(`${MH}/rigs/default.mhskel`, "utf8"));
  const joint = (n) => {
    const ids = skel.joints[n];
    const c = [0, 0, 0];
    for (const i of ids) for (let k = 0; k < 3; k++) c[k] += v[i][k];
    return c.map((x) => (x / ids.length) * S);
  };
  // Body faces only
  const bodyFaces = obj.faces.filter((f) => f.g === "body");
  const used = new Map();
  const pos = [], uv = [];
  const vmap = []; // new index -> original vertex index
  const ensure = (vi) => {
    let n = used.get(vi);
    if (n === undefined) {
      n = pos.length;
      used.set(vi, n);
      pos.push(v[vi].map((x) => x * S));
      vmap.push(vi);
    }
    return n;
  };
  const quads = bodyFaces.map((f) => f.vi.map(ensure));
  // UVs per original vertex (first seen) – only used for nothing critical
  // Skeleton
  const bones = {};
  for (const [name, b] of Object.entries(skel.bones)) bones[name] = { name, parent: b.parent, head: joint(b.head), tail: joint(b.tail) };
  const keep = new Set(KEEP);
  const keptOf = (name) => {
    let n = name;
    while (n && !keep.has(n)) n = bones[n].parent;
    return n || "root";
  };
  const weightsFile = JSON.parse(fs.readFileSync(`${MH}/rigs/default_weights.mhw`, "utf8"));
  const vw = new Map(); // orig vi -> Map(bone -> w)
  const raw = new Map(); // orig vi -> Map(origBone -> w)
  for (const [bone, list] of Object.entries(weightsFile.weights)) {
    const kb = keptOf(bone);
    for (const [vi, w] of list) {
      let m = vw.get(vi);
      if (!m) vw.set(vi, (m = new Map()));
      m.set(kb, (m.get(kb) || 0) + w);
      let r = raw.get(vi);
      if (!r) raw.set(vi, (r = new Map()));
      r.set(bone, (r.get(bone) || 0) + w);
    }
  }
  const boneList = KEEP;
  const boneIndex = new Map(boneList.map((b, i) => [b, i]));
  const skin = pos.map((_, n) => {
    const m = vw.get(vmap[n]) || new Map([["root", 1]]);
    const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = arr.reduce((s, x) => s + x[1], 0) || 1;
    return arr.map(([b, w]) => [boneIndex.get(b), w / tot]);
  });
  const rawW = (n, re) => {
    const r = raw.get(vmap[n]);
    if (!r) return 0;
    let s = 0;
    for (const [b, w] of r) if (re.test(b)) s += w;
    return s;
  };
  // Ground: soles at y=0 (shoes add their own lift later)
  const minY = Math.min(...pos.map((p) => p[1]));
  for (const p of pos) p[1] -= minY;
  for (const b of Object.values(bones)) {
    b.head[1] -= minY;
    b.tail[1] -= minY;
  }
  const helperVerts = (n) => v[n].map((x) => x * S);
  return { pos, quads, skin, bones, boneList, boneIndex, vmap, rawW, minY, morphed: v, helperVerts, obj };
}

export function vertexNormals(pos, faces) {
  const n = pos.map(() => [0, 0, 0]);
  for (const f of faces) {
    for (let k = 0; k < f.length; k++) {
      const a = pos[f[k]], b = pos[f[(k + 1) % f.length]], c = pos[f[(k + f.length - 1) % f.length]];
      const fn = V.cross(V.sub(b, a), V.sub(c, a));
      const i = f[k];
      n[i][0] += fn[0];
      n[i][1] += fn[1];
      n[i][2] += fn[2];
    }
  }
  return n.map(V.norm);
}
