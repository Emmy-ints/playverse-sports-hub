/**
 * Tennis motion for the realistic athletes: motion-captured ready stance and running, forehand,
 * one-handed backhand and serve, blended per bone. Driven purely by simulation state (position,
 * velocity, armed shot, last swing and its contact time), so it looks the same online and offline.
 */
import * as pc from "playcanvas";
import type { Athlete, AthleteAssets, Clip, Layer } from "../character/athlete.ts";
import type { AnimInput } from "./player-anim.ts";

export interface TennisAnimInput extends AnimInput {
  /** Ball position, used to pick the backswing side before the stroke is decided. */
  ballX: number;
  ballZ: number;
}

const RATE = { fh: 1.25, bh: 1.35, serve: 1.15 } as const;
const LEAD = 0.14; // seconds of the stroke shown before contact

/** Elliptical racket frame (tube around an ellipse in the XY plane), built once per device. */
const ringCache = new WeakMap<pc.GraphicsDevice, { ring: pc.Mesh; face: pc.Mesh }>();
function racketMeshes(device: pc.GraphicsDevice): { ring: pc.Mesh; face: pc.Mesh } {
  const hit = ringCache.get(device);
  if (hit) return hit;
  const A = 0.125, B = 0.16, R = 0.009, SEG = 40, SIDES = 8;
  const pos: number[] = [], nrm: number[] = [], idx: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    const cx = Math.cos(t) * A, cy = Math.sin(t) * B;
    // outward normal of the ellipse in its plane
    let nx = Math.cos(t) / A, ny = Math.sin(t) / B;
    const l = Math.hypot(nx, ny);
    nx /= l;
    ny /= l;
    for (let j = 0; j <= SIDES; j++) {
      const a = (j / SIDES) * Math.PI * 2;
      const ox = nx * Math.cos(a), oy = ny * Math.cos(a), oz = Math.sin(a) * 0.9;
      pos.push(cx + ox * R, cy + oy * R, oz * R);
      nrm.push(ox, oy, oz);
    }
  }
  for (let i = 0; i < SEG; i++)
    for (let j = 0; j < SIDES; j++) {
      const a = i * (SIDES + 1) + j, b = a + SIDES + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const ring = new pc.Mesh(device);
  ring.setPositions(pos);
  ring.setNormals(nrm);
  ring.setIndices(idx);
  ring.update(pc.PRIMITIVE_TRIANGLES);
  // String bed: a flat ellipse just inside the frame (double-sided material).
  const fp: number[] = [0, 0, 0], fn: number[] = [0, 0, 1], fi: number[] = [];
  for (let i = 0; i <= SEG; i++) {
    const t = (i / SEG) * Math.PI * 2;
    fp.push(Math.cos(t) * (A - R * 0.5), Math.sin(t) * (B - R * 0.5), 0);
    fn.push(0, 0, 1);
    if (i > 0) fi.push(0, i, i + 1);
  }
  const face = new pc.Mesh(device);
  face.setPositions(fp);
  face.setNormals(fn);
  face.setIndices(fi);
  face.update(pc.PRIMITIVE_TRIANGLES);
  const out = { ring, face };
  ringCache.set(device, out);
  return out;
}

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

export class TennisAthleteAnimator {
  private c: Record<"idle" | "run" | "fh" | "bh" | "serve", Clip>;
  private loco = 0;
  private idleT = Math.random() * 2;
  private yawOff = 0;
  private lastSwingAt = -10;
  private action: { clip: Clip; kind: "fh" | "bh" | "serve"; at: number } | null = null;
  private prepW = 0;
  private prepKind: "fh" | "bh" = "fh";
  private serveW = 0;
  private runW = 0;
  private layers: Layer[] = [];
  readonly racket: pc.Entity;

  constructor(
    private a: Athlete,
    assets: AthleteAssets,
    mats: { frame: pc.Material; strings: pc.Material; grip: pc.Material },
    device: pc.GraphicsDevice,
  ) {
    const k = assets.clips;
    this.c = { idle: k["idle"]!, run: k["run"]!, fh: k["fh"]!, bh: k["bh"]!, serve: k["serve"]! };
    a.setGrip("R", 0.9, 0.7);
    a.setGrip("L", 0.3, 0.2);
    // Racket in the right palm: handle across the palm, head out past the index finger.
    const h = assets.rig.hand.R;
    const dir = new pc.Vec3(h.dir[0], h.dir[1], h.dir[2]);
    const across = new pc.Vec3(h.across[0], h.across[1], h.across[2]);
    const normal = new pc.Vec3(h.normal[0], h.normal[1], h.normal[2]);
    const yAxis = new pc.Vec3().copy(across).mulScalar(0.8).add(new pc.Vec3().copy(dir).mulScalar(0.55)).normalize();
    const zAxis = new pc.Vec3().copy(normal).sub(new pc.Vec3().copy(yAxis).mulScalar(normal.dot(yAxis))).normalize();
    const xAxis = new pc.Vec3().cross(yAxis, zAxis);
    const m = new pc.Mat4();
    const d = m.data;
    d[0] = xAxis.x; d[1] = xAxis.y; d[2] = xAxis.z;
    d[4] = yAxis.x; d[5] = yAxis.y; d[6] = yAxis.z;
    d[8] = zAxis.x; d[9] = zAxis.y; d[10] = zAxis.z;
    const rot = new pc.Quat().setFromMat4(m);
    const palm = new pc.Vec3().copy(dir).mulScalar(0.07).sub(new pc.Vec3().copy(normal).mulScalar(0.028));
    const butt = new pc.Vec3().copy(palm).sub(new pc.Vec3().copy(yAxis).mulScalar(0.07));
    this.racket = new pc.Entity("racket");
    this.racket.setLocalPosition(butt);
    this.racket.setLocalRotation(rot);
    (a.bone("wrist.R") ?? a.root).addChild(this.racket);
    const add = (type: string, mat: pc.Material, pos: [number, number, number], scale: [number, number, number], r?: [number, number, number]) => {
      const e = new pc.Entity();
      e.addComponent("render", { type, material: mat, castShadows: true, receiveShadows: false });
      e.setLocalPosition(...pos);
      e.setLocalScale(...scale);
      if (r) e.setLocalEulerAngles(...r);
      this.racket.addChild(e);
    };
    add("cylinder", mats.grip, [0, 0.095, 0], [0.03, 0.19, 0.026]);
    add("cylinder", mats.frame, [0.03, 0.27, 0], [0.014, 0.19, 0.014], [0, 0, 18]);
    add("cylinder", mats.frame, [-0.03, 0.27, 0], [0.014, 0.19, 0.014], [0, 0, -18]);
    const ring = new pc.Entity("frame");
    const meshes = racketMeshes(device);
    ring.addComponent("render", { meshInstances: [new pc.MeshInstance(meshes.ring, mats.frame), new pc.MeshInstance(meshes.face, mats.strings)], castShadows: true, receiveShadows: false });
    ring.setLocalPosition(0, 0.52, 0);
    this.racket.addChild(ring);
  }

  update(inp: TennisAnimInput, now: number, dt: number) {
    const a = this.a;
    a.root.setPosition(inp.x, 0, inp.z);
    const base = inp.facing < 0 ? 0 : 180;

    // New stroke: play it so the clip's contact frame lands on the simulation's contact time.
    if (inp.swing && inp.swingAt !== this.lastSwingAt) {
      this.lastSwingAt = inp.swingAt;
      if (now - inp.swingAt < 0.6) this.action = { clip: this.c[inp.swing], kind: inp.swing, at: inp.swingAt };
    }
    let actW = 0;
    let actT = 0;
    if (this.action) {
      const { clip, kind, at } = this.action;
      const rate = RATE[kind];
      actT = clip.contact - LEAD + (now - at) * rate;
      const end = clip.duration;
      if (actT >= end) this.action = null;
      else {
        const fadeIn = clamp01((now - at) / 0.06 + 0.5);
        const fadeOut = clamp01((end - actT) / (0.3 * rate));
        actW = Math.min(fadeIn, fadeOut);
      }
    }

    // Movement: face the net when still, turn into the run when moving; backpedal when going back.
    const speed = Math.hypot(inp.vx, inp.vz);
    let back = false;
    let want = 0;
    if (speed > 0.9 && actW < 0.5) {
      want = wrap((Math.atan2(-inp.vx, -inp.vz) * 180) / Math.PI - base);
      if (Math.abs(want) > 115) {
        want = wrap(want - 180);
        back = true;
      }
      want *= clamp01((speed - 0.9) / 1.5);
    }
    this.yawOff += (want - this.yawOff) * (1 - Math.exp(-dt * 9));
    a.root.setEulerAngles(0, base + this.yawOff, 0);

    const runTarget = clamp01((speed - 0.5) / 1.8);
    this.runW += (runTarget - this.runW) * (1 - Math.exp(-dt * 10));
    this.loco += dt * Math.max(0.6, speed / 4.4) * (back ? -1 : 1);
    this.idleT += dt;

    // Backswing while a shot is armed (side chosen from where the ball is), trophy pose when serving.
    const rel = (inp.ballX - inp.x) * (inp.facing < 0 ? 1 : -1);
    if (inp.armed && !this.action) this.prepKind = rel >= 0 ? "fh" : "bh";
    this.prepW += ((inp.armed && !this.action ? 0.85 : 0) - this.prepW) * (1 - Math.exp(-dt * 8));
    this.serveW += ((inp.serving && !this.action ? 0.9 : 0) - this.serveW) * (1 - Math.exp(-dt * 6));

    const L = this.layers;
    L.length = 0;
    const rest = 1 - actW;
    const pose = rest * (1 - Math.max(this.prepW, this.serveW) * 0.85);
    L.push({ clip: this.c.idle, time: this.idleT, weight: pose * (1 - this.runW) });
    L.push({ clip: this.c.run, time: this.loco, weight: pose * this.runW });
    if (this.prepW > 0.01) {
      const c = this.c[this.prepKind];
      L.push({ clip: c, time: Math.max(0, c.contact - 0.32), weight: rest * this.prepW * 0.85 });
    }
    if (this.serveW > 0.01) L.push({ clip: this.c.serve, time: Math.max(0, this.c.serve.contact - 0.42) + Math.sin(this.idleT * 2) * 0.01, weight: rest * this.serveW * 0.85 });
    if (this.action && actW > 0) L.push({ clip: this.action.clip, time: actT, weight: actW });
    a.pose(L);
  }

  destroy() {
    this.racket.destroy();
  }
}
