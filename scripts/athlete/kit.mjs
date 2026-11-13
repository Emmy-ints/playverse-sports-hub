// Region classification, clothing/hair shells, skin vertex colours, eyes.
import fs from "node:fs";
import { V, noise3 } from "./lib.mjs";
import { MH, loadObj, vertexNormals } from "./body.mjs";

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const along = (p, a, b) => {
  const d = V.sub(b, a);
  return V.dot(V.sub(p, a), d) / V.dot(d, d);
};

export function fields(b) {
  const { pos, skin, boneList, bones } = b;
  const J = (n) => bones[n].head;
  const dom = pos.map((_, i) => boneList[skin[i][0][0]]);
  const isArm = (n) => /^(clavicle|shoulder01|upperarm|lowerarm|wrist|finger|metacarpal)/.test(n);
  const isLeg = (n) => /^(pelvis|upperleg|lowerleg|foot|toe)/.test(n);
  const isHead = (n) => /^(head|neck0[23])$/.test(n);
  const hipY = J("upperleg01.L")[1];
  const shirtHem = hipY + 0.05;
  const shortsTop = hipY + 0.13;
  const neck = J("neck01");
  const H0 = J("head"), Ht = bones.head.tail;
  // ear centres: the outermost head vertices at mid height on each side
  const ears = [1, -1].map((sg) => {
    let mx = 0;
    const cand = [];
    for (let i = 0; i < pos.length; i++) {
      if (!isHead(dom[i])) continue;
      const yr = (pos[i][1] - H0[1]) / (Ht[1] - H0[1]);
      if (yr < 0.15 || yr > 0.65) continue;
      const x = pos[i][0] * sg;
      if (x > mx) mx = x;
      cand.push(i);
    }
    const sel = cand.filter((i) => pos[i][0] * sg > mx - 0.012);
    const c = [0, 0, 0];
    for (const i of sel) for (let k = 0; k < 3; k++) c[k] += pos[i][k] / sel.length;
    return c;
  });
  const F = { top: [], bottom: [], socks: [], shoes: [], scalp: [], sleeve: [], thigh: [], yr: [], az: [] };
  for (let i = 0; i < pos.length; i++) {
    const p = pos[i];
    const d = dom[i];
    const s = p[0] >= 0 ? "L" : "R";
    const sleeveT = along(p, J(`upperarm01.${s}`), J(`lowerarm01.${s}`));
    const thighT = along(p, J(`upperleg01.${s}`), J(`lowerleg01.${s}`));
    const shinT = along(p, J(`lowerleg01.${s}`), J(`foot.${s}`));
    const ankle = J(`foot.${s}`)[1];
    const fz = clamp((p[2] - neck[2]) / 0.09, 0, 1);
    const collar = neck[1] + 0.012 - 0.06 * Math.sin(fz * Math.PI * 0.5) * Math.max(0, 1 - Math.abs(p[0] - neck[0]) / 0.09);
    let top = Math.min(p[1] - shirtHem, collar - p[1]);
    if (isArm(d)) top = Math.min(top, (0.4 - sleeveT) * 0.3);
    if (isHead(d)) top = Math.min(top, -0.01);
    let bottom = shortsTop - p[1];
    if (isLeg(d)) bottom = Math.min(bottom, (0.6 - thighT) * 0.4);
    if (isArm(d) || isHead(d)) bottom = -1;
    let socks = -1, shoes = -1;
    if (isLeg(d)) {
      socks = /^(foot|toe)/.test(d) ? 0.05 : (shinT - 0.8) * 0.4;
      shoes = ankle + 0.012 - p[1];
    }
    const yr = (p[1] - H0[1]) / (Ht[1] - H0[1]);
    const az = Math.abs(Math.atan2(p[0] - H0[0], p[2] - H0[2])) * (180 / Math.PI);
    const line = az < 35 ? 0.7 : az < 70 ? 0.7 - (az - 35) * 0.0051 : az < 110 ? 0.52 - (az - 70) * 0.002 : az < 150 ? 0.44 - (az - 110) * 0.0072 : 0.152 - (az - 150) * 0.0017;
    let scalp = (yr - line) * 0.12;
    // keep the ears clear
    const earD = Math.abs(p[0] - H0[0]) - 0.064;
    for (const ec of ears) {
      if ((p[0] > 0) !== (ec[0] > 0)) continue;
      const e = Math.hypot((p[1] - ec[1]) / 0.042, (p[2] - ec[2]) / 0.034);
      scalp = Math.min(scalp, (e - 1) * 0.03);
    }
    if (!isHead(d) && d !== "neck01") scalp = -1;
    F.top.push(top); F.bottom.push(bottom); F.socks.push(socks); F.shoes.push(shoes); F.scalp.push(scalp);
    F.sleeve.push(sleeveT); F.thigh.push(thighT); F.yr.push(yr); F.az.push(az);
  }
  return F;
}

export const toTris = (qs) => qs.flatMap((q) => (q.length === 4 ? [[q[0], q[1], q[2]], [q[0], q[2], q[3]]] : [q]));

function blendSkin(sa, sb, t) {
  const m = new Map();
  for (const [j, w] of sa) m.set(j, (m.get(j) || 0) + w * (1 - t));
  for (const [j, w] of sb) m.set(j, (m.get(j) || 0) + w * t);
  const arr = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  const tot = arr.reduce((s, x) => s + x[1], 0) || 1;
  return arr.map(([j, w]) => [j, w / tot]);
}

/**
 * Clip the body triangles to field >= 0 (smooth cut along the iso-line), offset outward, optionally
 * relax (fabric drape), and add a hem strip back to the skin at the open boundary.
 * opts: { offset(i) per original vertex, smooth: iterations, minOffset, attrs: {name: per-vertex array} }
 */
export function clipShell(b, normals, tris, field, opts) {
  const verts = []; // {a, b, t}
  const key = new Map();
  const vid = (a, c, t) => {
    if (t <= 0) return vid0(a);
    if (t >= 1) return vid0(c);
    const k = a < c ? `${a}|${c}` : `${c}|${a}`;
    let n = key.get(k);
    if (n === undefined) {
      n = verts.length;
      key.set(k, n);
      verts.push(a < c ? { a, b: c, t } : { a: c, b: a, t: 1 - t });
    }
    return n;
  };
  const vid0 = (a) => {
    const k = `${a}`;
    let n = key.get(k);
    if (n === undefined) {
      n = verts.length;
      key.set(k, n);
      verts.push({ a, b: a, t: 0 });
    }
    return n;
  };
  const out = [];
  const full = [];
  for (const tr of tris) {
    const f = tr.map((i) => field[i]);
    if (f.every((x) => x >= 0)) {
      out.push(tr.map(vid0));
      full.push(tr);
      continue;
    }
    if (f.every((x) => x < 0)) continue;
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const a = tr[k], c = tr[(k + 1) % 3];
      const fa = f[k], fc = f[(k + 1) % 3];
      if (fa >= 0) poly.push(vid0(a));
      if ((fa >= 0) !== (fc >= 0)) poly.push(vid(a, c, fa / (fa - fc)));
    }
    for (let k = 1; k + 1 < poly.length; k++) out.push([poly[0], poly[k], poly[k + 1]]);
  }
  const lerpA = (arr, v) => {
    const x = arr[v.a], y = arr[v.b];
    return Array.isArray(x) ? x.map((q, k) => q + (y[k] - q) * v.t) : x + (y - x) * v.t;
  };
  const base = verts.map((v) => V.lerp(b.pos[v.a], b.pos[v.b], v.t));
  const nrm = verts.map((v) => V.norm(V.lerp(normals[v.a], normals[v.b], v.t)));
  const off = verts.map((v) => lerpA(opts.offsetArr, v));
  const skin = verts.map((v) => (v.t === 0 ? b.skin[v.a] : blendSkin(b.skin[v.a], b.skin[v.b], v.t)));
  const onEdge = verts.map((v) => v.t !== 0);
  let pos = base.map((p, i) => V.add(p, V.mul(nrm[i], off[i])));
  // boundary
  const ecount = new Map();
  for (const t of out)
    for (let k = 0; k < 3; k++) {
      const a = t[k], c = t[(k + 1) % 3];
      const kk = a < c ? `${a},${c}` : `${c},${a}`;
      const e = ecount.get(kk);
      if (e) e.n++;
      else ecount.set(kk, { a, c, n: 1 });
    }
  const isB = new Array(verts.length).fill(false);
  for (const e of ecount.values()) if (e.n === 1) isB[e.a] = isB[e.c] = true;
  if (opts.smooth) {
    const nb = verts.map(() => new Set());
    for (const t of out) for (let k = 0; k < 3; k++) nb[t[k]].add(t[(k + 1) % 3]).add(t[(k + 2) % 3]);
    for (let it = 0; it < opts.smooth; it++) {
      pos = pos.map((p, i) => {
        if (isB[i] || !nb[i].size) return p;
        const c = [0, 0, 0];
        for (const j of nb[i]) for (let k = 0; k < 3; k++) c[k] += pos[j][k];
        return V.lerp(p, V.mul(c, 1 / nb[i].size), 0.5);
      });
      const min = opts.minOffset ?? 0.004;
      if (!opts.collide)
        pos = pos.map((p, i) => {
          const d = V.dot(V.sub(p, base[i]), nrm[i]);
          return d < min ? V.add(p, V.mul(nrm[i], min - d)) : p;
        });
    }
    if (opts.collide) {
      // keep the relaxed surface outside the body: push along own normal past the nearest body points
      const pts = opts.collide;
      for (let pass = 0; pass < 3; pass++)
        pos = pos.map((p, i) => {
          let best = Infinity, bi = -1;
          for (const j of pts) {
            const q = b.pos[j];
            const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2 + (q[2] - p[2]) ** 2;
            if (d < best) { best = d; bi = j; }
          }
          const d = V.dot(V.sub(p, b.pos[bi]), normals[bi]);
          return d < opts.minOffset ? V.add(p, V.mul(normals[bi], opts.minOffset - d)) : p;
        });
    }
  }
  if (opts.post) pos = pos.map((p, i) => opts.post(p, base[i], nrm[i], verts[i]));
  // hem strip
  const hemStart = pos.length;
  const hemMap = new Map();
  const hemV = (i) => {
    let n = hemMap.get(i);
    if (n === undefined) {
      n = pos.length;
      hemMap.set(i, n);
      pos.push(V.add(base[i], V.mul(nrm[i], 0.0015)));
      skin.push(skin[i]);
      nrm.push(nrm[i]);
      verts.push(verts[i]);
    }
    return n;
  };
  if (opts.hem !== false)
    for (const e of ecount.values())
      if (e.n === 1) {
        // find orientation from the owning triangle
        out.push([e.c, e.a, hemV(e.a)], [e.c, hemV(e.a), hemV(e.c)]);
      }
  const attrs = {};
  for (const [name, arr] of Object.entries(opts.attrs || {})) attrs[name] = verts.map((v) => lerpA(arr, v));
  return { pos, tris: out, skin, normals: nrm, full, attrs, hemStart };
}

export function eyes(b) {
  const text = fs.readFileSync(`${MH}/eyes/low-poly/low-poly.mhclo`, "utf8").split("\n");
  const scales = {};
  const refs = [];
  let inVerts = false;
  for (const line of text) {
    const p = line.trim().split(/\s+/);
    if (/^(x|y|z)_scale$/.test(p[0])) scales[p[0][0]] = { a: Number(p[1]), b: Number(p[2]), ref: Number(p[3]) };
    else if (p[0] === "verts") inVerts = true;
    else if (inVerts && p.length >= 9) refs.push({ v: [Number(p[0]), Number(p[1]), Number(p[2])], w: [Number(p[3]), Number(p[4]), Number(p[5])], o: [Number(p[6]), Number(p[7]), Number(p[8])] });
    else if (inVerts && p.length === 1 && p[0] !== "" && !isNaN(Number(p[0]))) refs.push({ v: [Number(p[0])], w: [1], o: [0, 0, 0] });
    else if (inVerts && p[0] && isNaN(Number(p[0]))) inVerts = false;
  }
  const mv = b.morphed;
  const sc = {};
  for (const k of ["x", "y", "z"]) {
    const s = scales[k];
    sc[k] = Math.abs(mv[s.a]["xyz".indexOf(k)] - mv[s.b]["xyz".indexOf(k)]) / s.ref;
  }
  const eo = loadObj(`${MH}/eyes/low-poly/low-poly.obj`);
  const pos = refs.map((r) => {
    const p = [0, 0, 0];
    r.v.forEach((vi, k) => {
      for (let c = 0; c < 3; c++) p[c] += mv[vi][c] * r.w[k];
    });
    p[0] += r.o[0] * sc.x;
    p[1] += r.o[1] * sc.y;
    p[2] += r.o[2] * sc.z;
    return [p[0] * 0.1, p[1] * 0.1 - b.minY, p[2] * 0.1];
  });
  // OBJ faces with UVs -> unique (v,t) vertices
  const out = { pos: [], uv: [], quads: [] };
  const key = new Map();
  for (const f of eo.faces) {
    out.quads.push(
      f.vi.map((vi, k) => {
        const kk = `${vi}/${f.ti[k]}`;
        let n = key.get(kk);
        if (n === undefined) {
          n = out.pos.length;
          key.set(kk, n);
          out.pos.push(pos[vi]);
          const t = eo.vt[f.ti[k]];
          out.uv.push([t[0], 1 - t[1]]);
        }
        return n;
      }),
    );
  }
  return out;
}

/** Multiplicative skin detail per vertex: lips, brows, cavity shading, mottling. */
export function skinColors(b, normals, faces, gender) {
  const { pos, bones } = b;
  const nbr = pos.map(() => new Set());
  for (const f of faces) for (let k = 0; k < f.length; k++) nbr[f[k]].add(f[(k + 1) % f.length]).add(f[(k + f.length - 1) % f.length]);
  const eyeL = bones["eye.L"].head, eyeR = bones["eye.R"].head;
  return pos.map((p, i) => {
    let c = [1, 1, 1];
    // cavity: average neighbour offset along normal (concave -> darker)
    let cav = 0;
    for (const j of nbr[i]) cav += V.dot(V.sub(pos[j], p), normals[i]);
    cav /= Math.max(1, nbr[i].size);
    const ao = clamp(1 - cav * 60, 0.72, 1.04);
    c = c.map((x) => x * ao);
    const lips = b.rawW(i, /^oris/);
    if (lips > 0.25 && normals[i][2] > 0.1) {
      const k = clamp((lips - 0.25) * 2.2, 0, 1) * (gender ? 0.7 : 1);
      c = [c[0] * (1 - 0.06 * k), c[1] * (1 - 0.26 * k), c[2] * (1 - 0.22 * k)];
    }
    for (const e of [eyeL, eyeR]) {
      const dx = (p[0] - e[0]) * (e[0] > 0 ? 1 : -1);
      const dy = p[1] - e[1];
      const archY = 0.019 + 0.004 * Math.cos(clamp((dx + 0.004) / 0.026, -1.5, 1.5)) - (dx > 0.016 ? (dx - 0.016) * 0.4 : 0);
      if (p[2] > e[2] - 0.004 && dx > -0.018 && dx < 0.03 && Math.abs(dy - archY) < (gender ? 0.0055 : 0.0038)) {
        const k = 1 - Math.abs(dy - archY) / (gender ? 0.0055 : 0.0038);
        const hair = 0.55 + 0.45 * noise3(p[0] * 900, p[1] * 300, 0);
        const m = 1 - 0.68 * clamp(k * 1.6, 0, 1) * hair;
        c = c.map((x) => x * m);
      }
    }
    // cheeks / nose / ears warmth
    const n = noise3(p[0] * 40, p[1] * 40, p[2] * 40) * 0.06 - 0.03;
    c = [c[0] * (1 + n), c[1] * (1 + n * 1.2), c[2] * (1 + n * 1.3)];
    return c.map((x) => clamp(x, 0, 1));
  });
}

export { vertexNormals };

/** A lofted shoe around the foot (one per side), rigged to foot / toe bones. */
export function makeShoe(b, F, side) {
  const s = side;
  const pts = [];
  for (let i = 0; i < b.pos.length; i++) if (F.shoes[i] > -0.035 && (s === "L" ? b.pos[i][0] > 0 : b.pos[i][0] < 0)) pts.push(b.pos[i]);
  const ankle = b.bones[`foot.${s}`].head;
  // forward axis: horizontal from ankle toward the farthest toe point
  let tip = pts[0];
  for (const p of pts) if (p[2] > tip[2]) tip = p;
  const fwd = V.norm([tip[0] - ankle[0], 0, tip[2] - ankle[2]]);
  const lat = V.norm(V.cross([0, 1, 0], fwd));
  const loc = (p) => [V.dot(V.sub(p, ankle), lat), p[1], V.dot(V.sub(p, ankle), fwd)];
  const L = pts.map(loc);
  const zMin = Math.min(...L.map((p) => p[2])) - 0.012, zMax = Math.max(...L.map((p) => p[2])) + 0.014;
  const NS = 18, NR = 20;
  const secs = [];
  for (let k = 0; k <= NS; k++) {
    const z = zMin + ((zMax - zMin) * k) / NS;
    const band = L.filter((p) => Math.abs(p[2] - z) < (zMax - zMin) / NS);
    let x0 = 0, x1 = 0, yTop = 0.06;
    if (band.length) {
      x0 = Math.min(...band.map((p) => p[0]));
      x1 = Math.max(...band.map((p) => p[0]));
      yTop = Math.min(ankle[1] + 0.02, Math.max(...band.map((p) => p[1])));
    }
    secs.push({ z, x0: x0 - 0.008, x1: x1 + 0.008, yTop: yTop + 0.01 });
  }
  // smooth profiles and round the ends
  for (let it = 0; it < 3; it++)
    for (let k = 1; k < NS; k++) for (const f of ["x0", "x1", "yTop"]) secs[k][f] = (secs[k - 1][f] + 2 * secs[k][f] + secs[k + 1][f]) / 4;
  const pos = [], tris = [], skin = [], part = [];
  const iFoot = b.boneIndex.get(`foot.${s}`), iToe = b.boneIndex.get(`toe1-1.${s}`);
  const toeZ = loc(b.bones[`toe1-1.${s}`].head)[2];
  secs.forEach((sec, k) => {
    const end = Math.min(k, NS - k) / 3; // taper ends
    const taper = Math.min(1, 0.55 + 0.45 * Math.min(1, end));
    const cx = (sec.x0 + sec.x1) / 2, hw = ((sec.x1 - sec.x0) / 2) * taper;
    const yb = -0.014, yt = yb + (sec.yTop - yb) * (k === 0 || k === NS ? 0.6 : taper);
    const cy = (yb + yt) / 2, hh = (yt - yb) / 2;
    for (let r = 0; r < NR; r++) {
      const a = (r / NR) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const e = 0.45; // superellipse exponent -> boxy sole, rounded top
      const px = cx + hw * Math.sign(c) * Math.pow(Math.abs(c), e);
      const py = cy + hh * Math.sign(sn) * Math.pow(Math.abs(sn), sn < 0 ? 0.25 : 0.8);
      const w = V.add(V.add(ankle, V.mul(lat, px)), V.mul(fwd, sec.z));
      pos.push([w[0], py, w[2]]);
      const tt = Math.max(0, Math.min(1, (sec.z - toeZ + 0.02) / 0.04));
      skin.push(tt > 0 ? [[iToe, tt], [iFoot, 1 - tt]] : [[iFoot, 1]]);
      part.push(py < yb + 0.018 ? 1 : 0); // sole
    }
  });
  for (let k = 0; k < NS; k++)
    for (let r = 0; r < NR; r++) {
      const a = k * NR + r, bb = k * NR + ((r + 1) % NR), c = (k + 1) * NR + r, d = (k + 1) * NR + ((r + 1) % NR);
      tris.push([a, bb, c], [bb, d, c]);
    }
  // end caps
  for (const k of [0, NS]) {
    const ci = pos.length;
    const ring = [...Array(NR).keys()].map((r) => pos[k * NR + r]);
    pos.push(ring.reduce((acc, p) => V.add(acc, V.mul(p, 1 / NR)), [0, 0, 0]));
    skin.push(skin[k * NR]);
    part.push(0);
    for (let r = 0; r < NR; r++) tris.push(k === 0 ? [ci, k * NR + ((r + 1) % NR), k * NR + r] : [ci, k * NR + r, k * NR + ((r + 1) % NR)]);
  }
  return { pos, tris, skin, part };
}
