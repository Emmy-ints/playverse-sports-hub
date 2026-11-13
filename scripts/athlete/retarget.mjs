// BVH (CMU mocap) -> MakeHuman reduced skeleton retargeting. Output: per-frame local rotations + root translation.
import fs from "node:fs";
import { V, Q } from "./lib.mjs";

export function parseBvh(file) {
  const tok = fs.readFileSync(file, "utf8").split(/\s+/).filter(Boolean);
  let p = 0;
  const joints = [];
  const parse = (parent) => {
    const kind = tok[p++]; // ROOT / JOINT / End
    if (kind === "End") {
      p++; // Site
      p++; // {
      p++; // OFFSET
      const off = [Number(tok[p++]), Number(tok[p++]), Number(tok[p++])];
      p++; // }
      if (parent) parent.end = off;
      return;
    }
    const j = { name: tok[p++], parent, children: [], channels: [] };
    joints.push(j);
    p++; // {
    while (tok[p] !== "}") {
      const t = tok[p++];
      if (t === "OFFSET") j.offset = [Number(tok[p++]), Number(tok[p++]), Number(tok[p++])];
      else if (t === "CHANNELS") {
        const n = Number(tok[p++]);
        for (let i = 0; i < n; i++) j.channels.push(tok[p++]);
      } else if (t === "JOINT" || t === "End") {
        p--;
        const before = joints.length;
        parse(j);
        if (joints.length > before) j.children.push(joints[before]);
      }
    }
    p++;
  };
  p++; // HIERARCHY
  parse(null);
  p++; // MOTION
  p++; // Frames:
  const frames = Number(tok[p++]);
  p += 2; // Frame Time:
  const dt = Number(tok[p++]);
  const nch = joints.reduce((s, j) => s + j.channels.length, 0);
  const data = new Float32Array(frames * nch);
  for (let i = 0; i < frames * nch; i++) data[i] = Number(tok[p++]);
  return { joints, frames, dt, nch, data, byName: new Map(joints.map((j) => [j.name, j])) };
}

/** World rotations/positions of every joint at a frame (fractional frames lerp). */
export function fk(bvh, f) {
  const f0 = Math.max(0, Math.min(bvh.frames - 1, Math.floor(f)));
  const f1 = Math.min(bvh.frames - 1, f0 + 1);
  const t = f - f0;
  const out = new Map();
  let c = 0;
  const vals0 = bvh.data.subarray(f0 * bvh.nch, (f0 + 1) * bvh.nch);
  const vals1 = bvh.data.subarray(f1 * bvh.nch, (f1 + 1) * bvh.nch);
  for (const j of bvh.joints) {
    let pos = [0, 0, 0];
    let qa = Q.id(), qb = Q.id();
    const pa = [0, 0, 0], pb = [0, 0, 0];
    for (const ch of j.channels) {
      const va = vals0[c], vb = vals1[c];
      c++;
      if (ch.endsWith("position")) {
        const k = "XYZ".indexOf(ch[0]);
        pa[k] = va;
        pb[k] = vb;
      } else {
        qa = Q.mul(qa, Q.euler(ch[0], va));
        qb = Q.mul(qb, Q.euler(ch[0], vb));
      }
    }
    const lq = Q.slerp(qa, qb, t);
    const lp = j.channels.some((x) => x.endsWith("position")) ? V.lerp(pa, pb, t) : j.offset;
    if (!j.parent) out.set(j.name, { q: lq, p: lp });
    else {
      const P = out.get(j.parent.name);
      out.set(j.name, { q: Q.mul(P.q, lq), p: V.add(P.p, Q.rot(P.q, j.offset)) });
    }
  }
  return out;
}

const restPos = (bvh) => {
  const out = new Map();
  for (const j of bvh.joints) out.set(j.name, j.parent ? V.add(out.get(j.parent.name), j.offset) : [0, 0, 0]);
  return out;
};

/**
 * Map: target bone -> { src: source joint, dir?: [srcFrom, srcTo] with target [from, to] bone heads }.
 * Bones not listed keep an identity local rotation (they follow their parent).
 */
export function mapping(side) {
  const S = side === "L" ? "Left" : "Right";
  const s = side;
  return {
    [`upperleg01.${s}`]: { src: `${S}UpLeg`, dir: [`${S}UpLeg`, `${S}Leg`], tdir: [`upperleg01.${s}`, `lowerleg01.${s}`] },
    [`lowerleg01.${s}`]: { src: `${S}Leg`, dir: [`${S}Leg`, `${S}Foot`], tdir: [`lowerleg01.${s}`, `foot.${s}`] },
    [`foot.${s}`]: { src: `${S}Foot`, dir: [`${S}Foot`, `${S}ToeBase`], tdir: [`foot.${s}`, `toe1-1.${s}`] },
    [`clavicle.${s}`]: { src: `${S}Shoulder`, dir: [`${S}Shoulder`, `${S}Arm`], tdir: [`clavicle.${s}`, `upperarm01.${s}`] },
    [`upperarm01.${s}`]: { src: `${S}Arm`, dir: [`${S}Arm`, `${S}ForeArm`], tdir: [`upperarm01.${s}`, `lowerarm01.${s}`] },
    [`lowerarm01.${s}`]: { src: `${S}ForeArm`, dir: [`${S}ForeArm`, `${S}Hand`], tdir: [`lowerarm01.${s}`, `wrist.${s}`] },
    [`wrist.${s}`]: { src: `${S}Hand`, dir: [`${S}Hand`, `${S}FingerBase`], tdir: [`wrist.${s}`, `finger3-1.${s}`] },
  };
}
export const MAP = {
  root: { src: "Hips" },
  spine05: { src: "LowerBack" },
  spine03: { src: "Spine" },
  spine01: { src: "Spine1" },
  neck01: { src: "Neck" },
  neck03: { src: "Neck1" },
  head: { src: "Head" },
  ...mapping("L"),
  ...mapping("R"),
};

/**
 * Retarget a window of a BVH clip. opts: { start, end (seconds), fps, yaw (deg, applied to the whole clip),
 * rootMode: 'inplace' | 'anchor', mirror?: boolean }
 */
export function retarget(bvh, target, opts) {
  const { bones, boneList } = target; // bones[name] = {head, parent}
  const rest = restPos(bvh);
  // source rest pose is all-identity rotations; CMU subjects face +Z in rest, left = +X (same as MakeHuman)
  const corr = {};
  for (const [tb, m] of Object.entries(MAP)) {
    if (!m.dir) {
      corr[tb] = Q.id();
      continue;
    }
    const sd = V.sub(rest.get(m.dir[1]), rest.get(m.dir[0]));
    const td = V.sub(bones[m.tdir[1]].head, bones[m.tdir[0]].head);
    corr[tb] = Q.between(td, sd);
  }
  // scale: hip height above ankle
  const srcLeg = V.len(V.sub(rest.get("LeftLeg"), rest.get("LeftUpLeg"))) + V.len(V.sub(rest.get("LeftFoot"), rest.get("LeftLeg")));
  const tgtLeg = V.len(V.sub(bones["lowerleg01.L"].head, bones["upperleg01.L"].head)) + V.len(V.sub(bones["foot.L"].head, bones["lowerleg01.L"].head));
  const scale = tgtLeg / srcLeg;
  const fps = opts.fps || 30;
  const srcFps = 1 / bvh.dt;
  const n = Math.max(2, Math.round((opts.end - opts.start) * fps) + 1);
  let yawDeg = opts.yaw || 0;
  if (opts.face !== false) {
    // auto-face: average hips forward over the window -> +Z, then apply opts.yaw on top
    let fx = 0, fz = 0;
    for (let i = 0; i < n; i += 2) {
      const w = fk(bvh, (opts.start + i / fps) * srcFps);
      const f = Q.rot(w.get("Hips").q, [0, 0, 1]);
      fx += f[0];
      fz += f[2];
    }
    yawDeg += (-Math.atan2(fx, fz) * 180) / Math.PI;
  }
  const yawQ = Q.euler("Y", yawDeg);
  // floor: lowest foot joint across the window
  let floor = Infinity;
  for (let i = 0; i < n; i++) {
    const w = fk(bvh, (opts.start + i / fps) * srcFps);
    for (const j of ["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]) floor = Math.min(floor, w.get(j).p[1]);
  }
  const tgtAnkle = bones["foot.L"].head[1];
  const tgtToe = bones["toe1-1.L"].head[1];
  const frames = [];
  let anchor = null;
  for (let i = 0; i < n; i++) {
    const w = fk(bvh, (opts.start + i / fps) * srcFps);
    const world = {};
    for (const name of boneList) {
      const m = MAP[name];
      const parent = bones[name].parent;
      if (m) world[name] = Q.mul(yawQ, Q.mul(w.get(m.src).q, corr[name]));
      else world[name] = parent ? world[parentKept(target, name)] : yawQ;
    }
    const local = boneList.map((name) => {
      const pk = parentKept(target, name);
      return Q.norm(pk ? Q.mul(Q.conj(world[pk]), world[name]) : world[name]);
    });
    const hp = Q.rot(yawQ, w.get("Hips").p);
    if (!anchor) anchor = hp;
    const rootHead = bones.root.head;
    const y = Math.min(tgtAnkle, tgtToe) + (hp[1] - floor) * scale + 0.0;
    let x = 0, z = 0;
    if (opts.rootMode === "anchor") {
      x = (hp[0] - anchor[0]) * scale;
      z = (hp[2] - anchor[2]) * scale;
    }
    frames.push({ local, root: [rootHead[0] + x, y, rootHead[2] + z], hp });
  }
  // root y above: keep feet on the floor by matching foot heights (src floor -> target ankle height)
  return { fps, frames, scale };
}

export function parentKept(target, name) {
  let p = target.bones[name].parent;
  const keep = target.boneIndex;
  while (p && !keep.has(p)) p = target.bones[p].parent;
  return p || null;
}
