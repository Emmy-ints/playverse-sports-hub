// Build realistic athlete GLBs (male / female) and the shared animation pack.
//   node build.mjs <outDir>
import fs from "node:fs";
import { V, Q, Gltf, encodePng, decodePng, noise3, hash3 } from "./lib.mjs";
import { buildBody, vertexNormals, MH } from "./body.mjs";
import { fields, clipShell, toTris, eyes, skinColors, makeShoe } from "./kit.mjs";
import { parseBvh, retarget, parentKept } from "./retarget.mjs";

const OUT = process.argv[2] || "/tmp/ath/out";
fs.mkdirSync(OUT, { recursive: true });
const CMU = "/home/claude/assets-src/cmu/data";

const VARIANTS = {
  m: { gender: 1, muscle: 0.86, height: 0.6 },
  f: { gender: 0, muscle: 0.66, height: 0.55 },
};

function triNormals(pos, tris) {
  return vertexNormals(pos, tris);
}

function hairStyles(b, N, tris, F) {
  const H0 = b.bones.head.head;
  const s = F.scalp;
  const styles = {};
  const shellStyle = (field, off, smooth, min = 0.0015) => clipShell(b, N, tris, field, { offsetArr: off, smooth, minOffset: min, attrs: { yr: F.yr, az: F.az } });
  styles.buzz = shellStyle(s, s.map(() => 0.0022), 0, 0.002);
  styles.short = shellStyle(s, s.map((x) => Math.min(0.012, 0.002 + Math.max(0, x) * 0.6)), 4);
  styles.curly = shellStyle(
    s.map((x) => x + 0.004),
    s.map((x, i) => Math.min(0.03, 0.003 + Math.max(0, x) * 1.5) + 0.008 * noise3(b.pos[i][0] * 70, b.pos[i][1] * 70, b.pos[i][2] * 70) * Math.min(1, Math.max(0, x) * 40)),
    2,
  );
  styles.mohawk = shellStyle(
    s,
    s.map((x, i) => {
      const crest = 0.028 - Math.abs(b.pos[i][0] - H0[0]);
      return crest > 0 ? 0.0022 + Math.min(0.045, crest * 2.2) * Math.min(1, Math.max(0, x) * 30) : 0.0022;
    }),
    2,
  );
  styles.long = shellStyle(s, s.map((x) => Math.min(0.012, 0.002 + Math.max(0, x) * 0.7)), 4);
  styles.ponytail = shellStyle(s, s.map((x) => Math.min(0.007, 0.002 + Math.max(0, x) * 0.4)), 3);
  // hanging parts
  styles.long.extra = longCurtain(b);
  styles.ponytail.extra = ponytail(b);
  return styles;
}

function headRadiusAt(b, az, yr) {
  const H0 = b.bones.head.head, Ht = b.bones.head.tail;
  let r = 0.07;
  let best = 0;
  for (let i = 0; i < b.pos.length; i++) {
    const p = b.pos[i];
    const y = (p[1] - H0[1]) / (Ht[1] - H0[1]);
    if (Math.abs(y - yr) > 0.06) continue;
    const a = Math.atan2(p[0] - H0[0], p[2] - H0[2]);
    let da = Math.abs(a - az);
    if (da > Math.PI) da = 2 * Math.PI - da;
    if (da > 0.12) continue;
    const d = Math.hypot(p[0] - H0[0], p[2] - H0[2]);
    if (d > best) best = d;
  }
  return best || r;
}

function longCurtain(b) {
  const H0 = b.bones.head.head, Ht = b.bones.head.tail;
  const hb = b.boneIndex.get("head"), nk = b.boneIndex.get("neck01"), sp = b.boneIndex.get("spine01");
  const bottom = b.bones["clavicle.L"].head[1] - 0.06;
  const COLS = 18, ROWS = 12;
  const pos = [], skin = [], uv = [], tris = [];
  for (let c = 0; c <= COLS; c++) {
    const az = ((100 + (160 * c) / COLS) * Math.PI) / 180; // behind the ears, around the back
    const r = headRadiusAt(b, az, 0.5) + 0.012;
    for (let rr = 0; rr <= ROWS; rr++) {
      const t = rr / ROWS;
      const yTop = H0[1] + (Ht[1] - H0[1]) * 0.52;
      const y = yTop + (bottom - yTop) * t;
      const spread = r + 0.018 * t + 0.012 * Math.sin(t * Math.PI);
      const jitter = 0.004 * (hash3(c, rr, 7) - 0.5);
      pos.push([H0[0] + Math.sin(az) * (spread + jitter), y, H0[2] + Math.cos(az) * (spread + jitter) - 0.012 * t]);
      const wHead = Math.max(0, Math.min(1, 1 - (t - 0.25) / 0.5));
      const w2 = 1 - wHead;
      skin.push(w2 > 0 ? [[hb, wHead], [nk, w2 * 0.6], [sp, w2 * 0.4]].filter((x) => x[1] > 0) : [[hb, 1]]);
      uv.push([c / COLS * 3, t * 2]);
    }
  }
  for (let c = 0; c < COLS; c++)
    for (let rr = 0; rr < ROWS; rr++) {
      const a = c * (ROWS + 1) + rr, bb = a + 1, cc = a + ROWS + 1, d = cc + 1;
      tris.push([a, bb, cc], [bb, d, cc]);
    }
  return { pos, skin, uv, tris };
}

function ponytail(b) {
  const H0 = b.bones.head.head, Ht = b.bones.head.tail;
  const hb = b.boneIndex.get("head");
  const start = [H0[0], H0[1] + (Ht[1] - H0[1]) * 0.6, H0[2] - headRadiusAt(b, Math.PI, 0.6) - 0.006];
  const RINGS = 12, SEG = 10;
  const pos = [], skin = [], uv = [], tris = [];
  let prev = null;
  for (let k = 0; k <= RINGS; k++) {
    const t = k / RINGS;
    const c = [start[0], start[1] + 0.03 * Math.sin(t * Math.PI * 0.6) - 0.24 * t * t, start[2] - 0.06 * Math.sin(t * Math.PI * 0.5)];
    const nxt = k < RINGS ? null : null;
    const dir = V.norm([0, -0.5 - t, -0.6 + t * 0.8]);
    const side = [1, 0, 0];
    const up = V.norm(V.cross(dir, side));
    const rad = 0.03 * (1 - t * 0.65) * (t < 0.08 ? 0.6 + t * 5 : 1);
    for (let s = 0; s < SEG; s++) {
      const a = (s / SEG) * Math.PI * 2;
      pos.push(V.add(c, V.add(V.mul(side, Math.cos(a) * rad), V.mul(up, Math.sin(a) * rad * 0.8))));
      skin.push([[hb, 1]]);
      uv.push([s / SEG, t * 2]);
    }
    prev = c;
  }
  for (let k = 0; k < RINGS; k++)
    for (let s = 0; s < SEG; s++) {
      const a = k * SEG + s, bb = k * SEG + ((s + 1) % SEG), c = (k + 1) * SEG + s, d = (k + 1) * SEG + ((s + 1) % SEG);
      tris.push([a, c, bb], [bb, c, d]);
    }
  // tip cap
  const ci = pos.length;
  pos.push(prev);
  skin.push([[hb, 1]]);
  uv.push([0.5, 2]);
  for (let s = 0; s < SEG; s++) tris.push([ci, RINGS * SEG + ((s + 1) % SEG), RINGS * SEG + s]);
  return { pos, skin, uv, tris };
}

function ring(b, center, axis, radius, height, bone, segs = 24) {
  // short open cylinder band
  const pos = [], skin = [], tris = [];
  const a = V.norm(axis);
  let u = V.norm(V.cross(a, [0, 0, 1]));
  if (V.len(V.cross(a, [0, 0, 1])) < 0.1) u = V.norm(V.cross(a, [1, 0, 0]));
  const w = V.cross(a, u);
  for (let k = 0; k < 2; k++)
    for (let s = 0; s < segs; s++) {
      const ang = (s / segs) * Math.PI * 2;
      const r = radius(ang);
      pos.push(V.add(V.add(center, V.mul(a, (k - 0.5) * height)), V.add(V.mul(u, Math.cos(ang) * r), V.mul(w, Math.sin(ang) * r))));
      skin.push(bone);
    }
  for (let s = 0; s < segs; s++) {
    const p0 = s, p1 = (s + 1) % segs, q0 = segs + s, q1 = segs + ((s + 1) % segs);
    tris.push([p0, p1, q0], [p1, q1, q0]);
  }
  return { pos, skin, tris };
}

function accessories(b, N, tris, F) {
  const H0 = b.bones.head.head, Ht = b.bones.head.tail;
  const hb = b.boneIndex.get("head");
  // headband: band hugging the head at the hairline, tilted down at the front
  const yb = H0[1] + (Ht[1] - H0[1]) * 0.66;
  const band = ring(b, [H0[0], yb, H0[2] + 0.004], [0, 1, -0.18], (ang) => headRadiusAt(b, ang, 0.66) + 0.009, 0.034, [[hb, 1]], 32);
  // wristbands on both forearms near the wrist
  const wb = [];
  for (const s of ["L", "R"]) {
    const w = b.bones[`wrist.${s}`].head, e = b.bones[`lowerarm01.${s}`].head;
    const c = V.lerp(w, e, 0.12);
    const axis = V.sub(w, e);
    // measure forearm radius there
    let r = 0;
    for (let i = 0; i < b.pos.length; i++) {
      const d = V.sub(b.pos[i], c);
      const along = V.dot(d, V.norm(axis));
      if (Math.abs(along) > 0.01) continue;
      const rad = V.len(V.sub(d, V.mul(V.norm(axis), along)));
      if (rad < 0.06 && rad > r) r = rad;
    }
    const bi = b.boneIndex.get(`lowerarm02.${s}`);
    wb.push(ring(b, c, axis, () => r + 0.006, 0.05, [[bi, 1]], 20));
  }
  const wristbands = merge(wb);
  // cap: crown shell + brim
  const capF = F.scalp.map((x, i) => Math.max(x, (F.yr[i] - 0.6) * 0.12));
  const crown = clipShell(b, N, tris, capF, { offsetArr: capF.map(() => 0.016), smooth: 6, minOffset: 0.012 });
  const brimPos = [], brimTris = [], brimSkin = [];
  const front = H0[2] + headRadiusAt(b, 0, 0.66);
  const BR = 14;
  for (let k = 0; k <= BR; k++) {
    const ang = (-75 + (150 * k) / BR) * (Math.PI / 180);
    const r0 = headRadiusAt(b, ang, 0.66) + 0.012;
    const inner = [H0[0] + Math.sin(ang) * r0, yb + 0.004, H0[2] + Math.cos(ang) * r0];
    const ext = 0.075 * Math.cos(ang * 0.9);
    const outer = [inner[0] + Math.sin(ang) * ext * 0.6, inner[1] - 0.012, inner[2] + Math.cos(ang) * ext];
    brimPos.push(inner, outer);
    brimSkin.push([[hb, 1]], [[hb, 1]]);
  }
  for (let k = 0; k < BR; k++) {
    const a = k * 2;
    brimTris.push([a, a + 2, a + 1], [a + 1, a + 2, a + 3]);
  }
  void front;
  const cap = merge([{ pos: crown.pos, skin: crown.skin, tris: crown.tris }, { pos: brimPos, skin: brimSkin, tris: brimTris }]);
  return { headband: band, wristbands, cap };
}

function merge(list) {
  const out = { pos: [], skin: [], tris: [], uv: [] };
  for (const m of list) {
    const o = out.pos.length;
    out.pos.push(...m.pos);
    out.skin.push(...m.skin);
    if (m.uv) out.uv.push(...m.uv);
    out.tris.push(...m.tris.map((t) => t.map((i) => i + o)));
  }
  if (!out.uv.length) delete out.uv;
  return out;
}

/** Compact mesh: drop unused vertices. */
function compact(m) {
  const used = new Map();
  const remap = (i) => {
    let n = used.get(i);
    if (n === undefined) {
      n = used.size;
      used.set(i, n);
    }
    return n;
  };
  const tris = m.tris.map((t) => t.map(remap));
  const order = [...used.keys()];
  const pick = (arr) => (arr ? order.map((i) => arr[i]) : undefined);
  return { ...m, tris, pos: pick(m.pos), skin: pick(m.skin), color: pick(m.color), uv: pick(m.uv) };
}

function makeTextures() {
  // hair strand texture: grey streaks along v
  const W = 128, H = 256;
  const d = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = noise3(x * 0.9, y * 0.04, 1) * 0.6 + noise3(x * 0.25, y * 0.02, 5) * 0.4;
      const v = Math.round(150 + 105 * Math.pow(n, 1.5));
      const o = (y * W + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = v;
      d[o + 3] = 255;
    }
  return { hair: encodePng(W, H, d, 4) };
}

function buildVariant(key, params, gltf, textures) {
  const b = buildBody(params);
  const N = vertexNormals(b.pos, b.quads);
  const F = fields(b);
  const tris = toTris(b.quads);
  const hipY = b.bones["upperleg01.L"].head[1];
  const top = clipShell(b, N, tris, F.top, { offsetArr: F.sleeve.map((s, i) => (b.pos[i][1] > b.bones["clavicle.L"].head[1] - 0.04 ? 0.009 : 0.011 + 0.008 * Math.max(0, 1 - s))), smooth: 12, minOffset: 0.007 });
  const bot = clipShell(b, N, tris, F.bottom, { offsetArr: F.thigh.map((t, i) => (b.pos[i][1] > hipY ? 0.006 : 0.008 + 0.02 * Math.max(0, Math.min(1, t)))), smooth: 8, minOffset: 0.006 });
  const socksF = F.socks.map((f, i) => Math.min(f, b.pos[i][1] - 0.05));
  const socks = clipShell(b, N, tris, socksF, { offsetArr: F.socks.map(() => 0.003), smooth: 2, minOffset: 0.0025 });
  const shoeL = makeShoe(b, F, "L"), shoeR = makeShoe(b, F, "R");
  const hide = (tr) => [F.top, F.bottom, F.shoes].some((f) => tr.every((i) => f[i] >= 0)) || tr.every((i) => socksF[i] >= 0);
  const skinT = tris.filter((t) => !hide(t));
  const sc = skinColors(b, N, b.quads, params.gender);
  const ey = eyes(b);
  const hair = hairStyles(b, N, tris, F);
  const acc = accessories(b, N, tris, F);
  const lift = 0.016; // shoe sole thickness: raise everything so soles rest on y = 0

  // --- skeleton nodes ---
  const J = gltf.json;
  const nodeBase = J.nodes.length;
  const armature = { name: `Armature`, children: [] };
  J.nodes.push(armature);
  const armIdx = nodeBase;
  const boneNode = {};
  b.boneList.forEach((name) => {
    const pk = parentKept(b, name);
    const head = b.bones[name].head;
    const t = pk ? V.sub(head, b.bones[pk].head) : [head[0], head[1] + lift, head[2]];
    J.nodes.push({ name, translation: t });
    boneNode[name] = J.nodes.length - 1;
  });
  b.boneList.forEach((name) => {
    const pk = parentKept(b, name);
    const n = boneNode[name];
    if (pk) (J.nodes[boneNode[pk]].children ||= []).push(n);
    else armature.children.push(n);
  });
  const ibm = new Float32Array(b.boneList.length * 16);
  b.boneList.forEach((name, i) => {
    const h = b.bones[name].head;
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -h[0], -(h[1] + lift), -h[2], 1], i * 16);
  });
  J.skins.push({ joints: b.boneList.map((n) => boneNode[n]), inverseBindMatrices: gltf.accessor(ibm, "MAT4"), skeleton: boneNode.root, name: `skin_${key}` });
  const skinIdx = J.skins.length - 1;

  const mats = {};
  const mat = (name, def) => {
    const k = `${name}`;
    if (mats[k] !== undefined) return mats[k];
    J.materials.push({ name, ...def });
    return (mats[k] = J.materials.length - 1);
  };
  const prim = (m, materialIdx, { color, uv } = {}) => {
    m = compact({ ...m, color, uv: uv || m.uv });
    const n = m.pos.length;
    const P = new Float32Array(n * 3);
    m.pos.forEach((p, i) => P.set([p[0], p[1] + lift, p[2]], i * 3));
    const nrm = vertexNormals(m.pos, m.tris);
    const Nn = new Float32Array(n * 3);
    nrm.forEach((v, i) => Nn.set(v, i * 3));
    const Jt = new Uint8Array(n * 4);
    const Wt = new Float32Array(n * 4);
    m.skin.forEach((s, i) => {
      s.forEach(([j, w], k) => {
        Jt[i * 4 + k] = j;
        Wt[i * 4 + k] = w;
      });
    });
    const idx = n > 65535 ? new Uint32Array(m.tris.flat()) : new Uint16Array(m.tris.flat());
    const attributes = {
      POSITION: gltf.accessor(P, "VEC3", { minmax: true, target: 34962 }),
      NORMAL: gltf.accessor(Nn, "VEC3", { target: 34962 }),
      JOINTS_0: gltf.accessor(Jt, "VEC4", { target: 34962 }),
      WEIGHTS_0: gltf.accessor(Wt, "VEC4", { target: 34962 }),
    };
    if (m.color) {
      const C = new Uint8Array(n * 4);
      m.color.forEach((c, i) => C.set([Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255), 255], i * 4));
      attributes.COLOR_0 = gltf.accessor(C, "VEC4", { normalized: true, target: 34962 });
    }
    if (m.uv) {
      const U = new Float32Array(n * 2);
      m.uv.forEach((t, i) => U.set(t, i * 2));
      attributes.TEXCOORD_0 = gltf.accessor(U, "VEC2", { target: 34962 });
    }
    return { attributes, indices: gltf.accessor(idx, "SCALAR", { target: 34963 }), material: materialIdx };
  };
  const meshNode = (name, prims) => {
    J.meshes.push({ name, primitives: prims });
    J.nodes.push({ name, mesh: J.meshes.length - 1, skin: skinIdx });
    return J.nodes.length - 1;
  };

  const M = {
    skin: mat("skin", { pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 0.55 } }),
    eyes: mat("eyes", { pbrMetallicRoughness: { baseColorTexture: { index: textures.eye }, metallicFactor: 0, roughnessFactor: 0.15 } }),
    top: mat("kit_top", { pbrMetallicRoughness: { baseColorFactor: [0.2, 0.45, 0.95, 1], metallicFactor: 0, roughnessFactor: 0.8 }, doubleSided: true }),
    bottom: mat("kit_bottom", { pbrMetallicRoughness: { baseColorFactor: [0.95, 0.95, 0.96, 1], metallicFactor: 0, roughnessFactor: 0.85 }, doubleSided: true }),
    socks: mat("socks", { pbrMetallicRoughness: { baseColorFactor: [0.97, 0.97, 0.97, 1], metallicFactor: 0, roughnessFactor: 0.95 }, doubleSided: true }),
    shoe: mat("shoe", { pbrMetallicRoughness: { baseColorFactor: [0.9, 0.4, 0.1, 1], metallicFactor: 0, roughnessFactor: 0.5 } }),
    sole: mat("sole", { pbrMetallicRoughness: { baseColorFactor: [0.96, 0.96, 0.95, 1], metallicFactor: 0, roughnessFactor: 0.7 } }),
    hair: mat("hair", { pbrMetallicRoughness: { baseColorFactor: [0.1, 0.07, 0.05, 1], baseColorTexture: { index: textures.hair }, metallicFactor: 0, roughnessFactor: 0.6 }, doubleSided: true }),
    acc: mat("accessory", { pbrMetallicRoughness: { baseColorFactor: [0.95, 0.95, 0.95, 1], metallicFactor: 0, roughnessFactor: 0.8 }, doubleSided: true }),
  };
  const children = [armIdx];
  children.push(
    meshNode("Body", [
      prim({ pos: b.pos, skin: b.skin, tris: skinT }, M.skin, { color: sc }),
      prim({ pos: ey.pos, skin: ey.pos.map(() => [[b.boneIndex.get("head"), 1]]), tris: toTris(ey.quads), uv: ey.uv }, M.eyes),
    ]),
  );
  children.push(meshNode("Top", [prim(top, M.top)]));
  children.push(meshNode("Bottom", [prim(bot, M.bottom)]));
  children.push(meshNode("Socks", [prim(socks, M.socks)]));
  const shoes = merge([shoeL, shoeR]);
  shoes.part = [...shoeL.part, ...shoeR.part];
  const soleT = shoes.tris.filter((t) => t.every((i) => shoes.part[i]));
  const upperT = shoes.tris.filter((t) => !t.every((i) => shoes.part[i]));
  children.push(meshNode("Shoes", [prim({ ...shoes, tris: upperT }, M.shoe), prim({ ...shoes, tris: soleT }, M.sole)]));
  const hairUv = (h) => h.pos.map((_, i) => [(h.attrs.az[i] / 180) * 3, h.attrs.yr[i] * 4]);
  for (const [name, h] of Object.entries(hair)) {
    const shellM = { pos: h.pos, skin: h.skin, tris: h.tris, uv: hairUv(h) };
    const m = h.extra ? merge([shellM, h.extra]) : shellM;
    children.push(meshNode(`Hair_${name}`, [prim(m, M.hair)]));
  }
  for (const [name, a] of Object.entries(acc)) children.push(meshNode(`Acc_${name}`, [prim(a, M.acc)]));
  J.nodes.push({ name: `Athlete_${key}`, children });
  J.scenes[0].nodes.push(J.nodes.length - 1);
  return b;
}

function writeGlb(key) {
  const g = new Gltf();
  const textures = makeTextures();
  const eyePng = fs.readFileSync(`${MH}/eyes/materials/brown_eye.png`);
  const eyeImg = decodePng(eyePng);
  // downsize eye texture to 128px
  const S = 128;
  const ed = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const sx = Math.floor((x / S) * eyeImg.w), sy = Math.floor((y / S) * eyeImg.h);
      ed.set(eyeImg.data.subarray((sy * eyeImg.w + sx) * 4, (sy * eyeImg.w + sx) * 4 + 4), (y * S + x) * 4);
    }
  const tex = { eye: g.image(encodePng(S, S, ed, 4), "eye"), hair: g.image(textures.hair, "hair") };
  const b = buildVariant(key, VARIANTS[key], g, tex);
  g.write(`${OUT}/athlete-${key}.glb`);
  return b;
}

// --- animation pack ---
function clipDefs() {
  return [
    { name: "idle", file: "077/77_03", start: 2.43, end: 2.43 + 2.27, loop: true, mode: "inplace" },
    { name: "run", file: "009/09_02", start: 0.32, end: 1.07, loop: true, mode: "inplace" },
    { name: "walk", file: "002/02_01", start: 1.49, end: 2.6, loop: true, mode: "inplace" },
    { name: "fh", file: "124/124_07", start: 2.25, end: 3.5, mode: "anchor", leftArmFrom: "idle", contact: 2.85 },
    { name: "bh", file: "124/124_09", start: 11.1, end: 12.3, mode: "anchor", contact: 11.78 },
    { name: "serve", file: "124/124_01", start: 3.25, end: 4.25, mode: "inplace", legsFrom: "idle", contact: 3.72 },
    { name: "cheer", file: "079/79_69", start: 3.6, end: 6.2, mode: "inplace" },
    { name: "sad", file: "079/79_71", start: 1.0, end: 4.0, mode: "inplace" },
  ];
}

function buildAnims(b) {
  const fps = 30;
  const animated = b.boneList.filter((n) => !/^(finger|metacarpal)/.test(n));
  const idx = animated.map((n) => b.boneList.indexOf(n));
  const results = {};
  const out = { version: 1, fps, bones: animated, clips: {} };
  for (const d of clipDefs()) {
    const bvh = parseBvh(`${CMU}/${d.file}.bvh`);
    const r = retarget(bvh, b, { start: d.start, end: d.end, fps, rootMode: d.mode });
    results[d.name] = r;
    const frames = r.frames;
    if (d.leftArmFrom || d.legsFrom) {
      const src = results[d.leftArmFrom || d.legsFrom].frames;
      const re = d.leftArmFrom ? /\.L$/ : /^(upperleg|lowerleg|foot|toe|pelvis)/;
      const re2 = d.leftArmFrom ? /^(clavicle|shoulder01|upperarm|lowerarm|wrist)/ : /./;
      frames.forEach((f, i) => {
        const s = src[i % src.length];
        b.boneList.forEach((n, k) => {
          if (re.test(n) && re2.test(n)) f.local[k] = s.local[k];
        });
        if (d.legsFrom) f.root = [f.root[0], s.root[1], f.root[2]];
      });
    }
    if (d.loop) {
      // cross-fade the last frames into the first for a seamless loop
      const n = frames.length;
      const blend = Math.min(6, Math.floor(n / 4));
      for (let k = 0; k < blend; k++) {
        const t = (k + 1) / (blend + 1);
        const fi = n - blend + k;
        const src = frames[k];
        frames[fi].local = frames[fi].local.map((q, j) => Q.slerp(q, src.local[j], t));
        frames[fi].root = V.lerp(frames[fi].root, src.root, t);
      }
      frames.pop(); // last == first
    }
    const rot = new Int16Array(frames.length * animated.length * 4);
    const root = new Float32Array(frames.length * 3);
    frames.forEach((f, i) => {
      idx.forEach((bi, k) => {
        let q = f.local[bi];
        // keep hemisphere continuity
        if (i > 0) {
          const o = ((i - 1) * animated.length + k) * 4;
          const pq = [rot[o], rot[o + 1], rot[o + 2], rot[o + 3]];
          if (pq[0] * q[0] + pq[1] * q[1] + pq[2] * q[2] + pq[3] * q[3] < 0) q = q.map((x) => -x);
        }
        rot.set(q.map((x) => Math.round(x * 32767)), (i * animated.length + k) * 4);
      });
      root.set([f.root[0], f.root[1] + 0.016, f.root[2]], i * 3);
    });
    out.clips[d.name] = {
      frames: frames.length,
      loop: !!d.loop,
      contact: d.contact !== undefined ? (d.contact - d.start) : undefined,
      rot: Buffer.from(rot.buffer).toString("base64"),
      root: Buffer.from(root.buffer).toString("base64"),
    };
  }
  // rig metadata for runtime finger posing and props
  const hand = {};
  for (const s of ["L", "R"]) {
    const w = b.bones[`wrist.${s}`].head;
    const m = b.bones[`finger3-1.${s}`].head;
    const idxB = b.bones[`finger2-1.${s}`].head, pk = b.bones[`finger5-1.${s}`].head;
    const dir = V.norm(V.sub(m, w));
    const across = V.norm(V.sub(idxB, pk));
    const normal = V.norm(V.cross(dir, across));
    hand[s] = { dir, across, normal };
  }
  out.rig = { hand, height: Math.max(...b.pos.map((p) => p[1])) + 0.016 };
  return out;
}

const bm = writeGlb("m");
const bf = writeGlb("f");
const anims = buildAnims(bm);
anims.rig.rootY = { m: bm.bones.root.head[1] + 0.016, f: bf.bones.root.head[1] + 0.016 };
fs.writeFileSync(`${OUT}/athlete-anims.json`, JSON.stringify(anims));
for (const f of fs.readdirSync(OUT)) console.log(f, (fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0) + "KB");
