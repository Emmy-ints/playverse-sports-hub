// Small math + glTF helpers for the athlete pipeline (no dependencies).
import fs from "node:fs";

export const V = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  norm: (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
};

// Quaternions [x,y,z,w]
export const Q = {
  id: () => [0, 0, 0, 1],
  mul: (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
  ],
  conj: (q) => [-q[0], -q[1], -q[2], q[3]],
  axis: (ax, ang) => {
    const s = Math.sin(ang / 2);
    const n = V.norm(ax);
    return [n[0] * s, n[1] * s, n[2] * s, Math.cos(ang / 2)];
  },
  rot: (q, v) => {
    const u = [q[0], q[1], q[2]];
    const s = q[3];
    const t = V.mul(V.cross(u, v), 2);
    return V.add(V.add(v, V.mul(t, s)), V.cross(u, t));
  },
  // minimal rotation taking unit a onto unit b
  between: (a, b) => {
    a = V.norm(a);
    b = V.norm(b);
    const d = V.dot(a, b);
    if (d < -0.99999) {
      let ax = V.cross([1, 0, 0], a);
      if (V.len(ax) < 1e-3) ax = V.cross([0, 1, 0], a);
      return Q.axis(ax, Math.PI);
    }
    const c = V.cross(a, b);
    const q = [c[0], c[1], c[2], 1 + d];
    return Q.norm(q);
  },
  norm: (q) => {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  },
  slerp: (a, b, t) => {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) {
      b = b.map((x) => -x);
      d = -d;
    }
    if (d > 0.9995) return Q.norm(a.map((x, i) => x + (b[i] - x) * t));
    const th = Math.acos(d);
    const s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s;
    const wb = Math.sin(t * th) / s;
    return a.map((x, i) => x * wa + b[i] * wb);
  },
  euler: (axis, deg) => Q.axis(axis === "X" ? [1, 0, 0] : axis === "Y" ? [0, 1, 0] : [0, 0, 1], (deg * Math.PI) / 180),
};

/** Minimal glTF 2.0 binary writer. */
export class Gltf {
  constructor() {
    this.json = { asset: { version: "2.0", generator: "playverse-athlete" }, scene: 0, scenes: [{ nodes: [] }], nodes: [], meshes: [], accessors: [], bufferViews: [], buffers: [], materials: [], skins: [], animations: [], images: [], textures: [], samplers: [] };
    this.chunks = [];
    this.byteLength = 0;
  }
  view(buf, target) {
    const pad = (4 - (this.byteLength % 4)) % 4;
    if (pad) {
      this.chunks.push(Buffer.alloc(pad));
      this.byteLength += pad;
    }
    const v = { buffer: 0, byteOffset: this.byteLength, byteLength: buf.byteLength };
    if (target) v.target = target;
    this.chunks.push(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength));
    this.byteLength += buf.byteLength;
    this.json.bufferViews.push(v);
    return this.json.bufferViews.length - 1;
  }
  accessor(typed, type, opts = {}) {
    const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[type];
    const ct = typed instanceof Float32Array ? 5126 : typed instanceof Uint32Array ? 5125 : typed instanceof Uint16Array ? 5123 : typed instanceof Uint8Array ? 5121 : typed instanceof Int16Array ? 5122 : 5120;
    const bv = this.view(typed, opts.target);
    const a = { bufferView: bv, componentType: ct, count: typed.length / comps, type };
    if (opts.normalized) a.normalized = true;
    if (opts.minmax) {
      const mn = new Array(comps).fill(Infinity);
      const mx = new Array(comps).fill(-Infinity);
      for (let i = 0; i < typed.length; i++) {
        const c = i % comps;
        if (typed[i] < mn[c]) mn[c] = typed[i];
        if (typed[i] > mx[c]) mx[c] = typed[i];
      }
      a.min = mn;
      a.max = mx;
    }
    this.json.accessors.push(a);
    return this.json.accessors.length - 1;
  }
  image(png, name) {
    const bv = this.view(png);
    this.json.images.push({ bufferView: bv, mimeType: "image/png", name });
    if (!this.json.samplers.length) this.json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 });
    this.json.textures.push({ source: this.json.images.length - 1, sampler: 0 });
    return this.json.textures.length - 1;
  }
  write(file) {
    const j = this.json;
    for (const k of ["skins", "animations", "images", "textures", "samplers", "materials", "meshes"]) if (!j[k].length) delete j[k];
    const bin = Buffer.concat(this.chunks);
    const binPad = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]);
    j.buffers = [{ byteLength: binPad.length }];
    let js = Buffer.from(JSON.stringify(j));
    js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546c67, 0);
    head.writeUInt32LE(2, 4);
    head.writeUInt32LE(12 + 8 + js.length + 8 + binPad.length, 8);
    const c1 = Buffer.alloc(8);
    c1.writeUInt32LE(js.length, 0);
    c1.writeUInt32LE(0x4e4f534a, 4);
    const c2 = Buffer.alloc(8);
    c2.writeUInt32LE(binPad.length, 0);
    c2.writeUInt32LE(0x004e4942, 4);
    fs.writeFileSync(file, Buffer.concat([head, c1, js, c2, binPad]));
  }
}

// --- PNG encode (RGB/RGBA 8-bit) ---
import zlib from "node:zlib";
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
export function encodePng(w, h, data, channels = 4) {
  const raw = Buffer.alloc((w * channels + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * channels + 1)] = 0;
    Buffer.from(data.buffer, data.byteOffset + y * w * channels, w * channels).copy(raw, y * (w * channels + 1) + 1);
  }
  const chunk = (type, d) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(d.length);
    const td = Buffer.concat([Buffer.from(type), d]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
export function decodePng(buf) {
  // 8-bit RGB/RGBA/greyscale, non-interlaced
  let p = 8;
  let w, h, ct, idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const d = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") {
      w = d.readUInt32BE(0);
      h = d.readUInt32BE(4);
      ct = d[9];
    } else if (type === "IDAT") idat.push(d);
    p += 12 + len;
  }
  const ch = { 0: 1, 2: 3, 4: 2, 6: 4 }[ct];
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(w * h * 4);
  const stride = w * ch;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = new Uint8Array(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[i] = v & 255;
    }
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if (ch >= 3) {
        out[o] = line[x * ch];
        out[o + 1] = line[x * ch + 1];
        out[o + 2] = line[x * ch + 2];
        out[o + 3] = ch === 4 ? line[x * ch + 3] : 255;
      } else {
        out[o] = out[o + 1] = out[o + 2] = line[x * ch];
        out[o + 3] = ch === 2 ? line[x * ch + 1] : 255;
      }
    }
    prev = line;
  }
  return { w, h, data: out };
}

// value noise for procedural detail
export function hash3(x, y, z) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(xf), v = s(yf), w = s(zf);
  let r = 0;
  for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) for (let dz = 0; dz < 2; dz++) r += hash3(xi + dx, yi + dy, zi + dz) * (dx ? u : 1 - u) * (dy ? v : 1 - v) * (dz ? w : 1 - w);
  return r;
}
