/**
 * Drives a realistic Athlete from a (hidden) classic Humanoid every frame. Each sport's existing
 * procedural animator keeps posing the humanoid's simple joint rig; this copies that motion onto the
 * athlete's skeleton (direction-corrected per limb, scaled to the athlete's size), so every sport
 * gets realistic bodies without rewriting its animation or gameplay.
 */
import * as pc from "playcanvas";
import type { Humanoid } from "./humanoid.ts";
import type { Athlete } from "./athlete.ts";

type JointKey = "hips" | "spine" | "head" | "shoulderL" | "shoulderR" | "elbowL" | "elbowR" | "handL" | "handR" | "hipL" | "hipR" | "kneeL" | "kneeR";

interface Map1 {
  bone: string;
  from: JointKey;
  /** Blend toward a second joint (torso twist spread over the spine). */
  to?: JointKey;
  t?: number;
  /** Child bone defining this bone's direction (limbs only). */
  dir?: string;
}

const MAP: Map1[] = [
  { bone: "root", from: "hips" },
  { bone: "spine05", from: "hips", to: "spine", t: 0.35 },
  { bone: "spine03", from: "hips", to: "spine", t: 0.7 },
  { bone: "spine01", from: "spine" },
  { bone: "neck01", from: "spine", to: "head", t: 0.5 },
  { bone: "head", from: "head" },
  ...(["L", "R"] as const).flatMap((s): Map1[] => [
    { bone: `upperarm01.${s}`, from: `shoulder${s}`, dir: `lowerarm01.${s}` },
    { bone: `lowerarm01.${s}`, from: `elbow${s}`, dir: `wrist.${s}` },
    { bone: `wrist.${s}`, from: `hand${s}`, dir: `finger3-1.${s}` },
    { bone: `upperleg01.${s}`, from: `hip${s}`, dir: `lowerleg01.${s}` },
    { bone: `lowerleg01.${s}`, from: `knee${s}`, dir: `foot.${s}` },
  ]),
];

const Y180 = new pc.Quat().setFromEulerAngles(0, 180, 0);
const HUMANOID_HIP_Y = 0.95;

export class HumanoidMirror {
  private entries: { e: pc.Entity; from: pc.Entity; to: pc.Entity | null; t: number; c: pc.Quat }[] = [];
  private feet: pc.Entity[] = [];
  private rootBone: pc.Entity | null;
  private scale: number;
  private q = new pc.Quat();
  private q2 = new pc.Quat();
  private v = new pc.Vec3();
  private v2 = new pc.Vec3();

  constructor(
    private h: Humanoid,
    readonly ath: Athlete,
  ) {
    // Model-space rest positions (rest bone rotations are identity, so offsets just add up).
    const modelPos = (e: pc.Entity) => {
      const p = new pc.Vec3();
      let n: pc.GraphNode | null = e;
      while (n && n !== ath.model) {
        p.add(n.getLocalPosition());
        n = n.parent;
      }
      return p;
    };
    for (const m of MAP) {
      const e = ath.bone(m.bone);
      if (!e) continue;
      const c = new pc.Quat().copy(Y180);
      if (m.dir) {
        const child = ath.bone(m.dir);
        if (child) {
          const d = modelPos(child).sub(modelPos(e)).normalize();
          const dRoot = Y180.transformVector(d, new pc.Vec3());
          const fix = between(dRoot, new pc.Vec3(0, -1, 0));
          c.mul2(fix, Y180);
        }
      }
      this.entries.push({ e, from: h[m.from], to: m.to ? h[m.to] : null, t: m.t ?? 0, c });
    }
    this.feet = ["foot.L", "foot.R"].map((n) => ath.bone(n)).filter((x): x is pc.Entity => !!x);
    this.rootBone = ath.bone("root");
    this.scale = this.rootBone ? modelPos(this.rootBone).y / HUMANOID_HIP_Y : 1;
    // Follow the humanoid's root.
    if (h.root.parent) ath.root.reparent(h.root.parent);
    this.hideSource();
  }

  /** Hide the classic meshes (call again after the humanoid is re-styled). */
  hideSource() {
    for (const r of this.h.root.findComponents("render") as pc.RenderComponent[]) r.enabled = false;
  }

  update() {
    const h = this.h, a = this.ath;
    a.root.enabled = h.root.enabled;
    if (!h.root.enabled) return;
    a.root.setLocalPosition(h.root.getLocalPosition());
    a.root.setLocalRotation(h.root.getLocalRotation());
    a.root.setLocalScale(h.root.getLocalScale());
    if (this.rootBone) {
      // hips position relative to the humanoid root, scaled to the athlete
      const rp = h.root.getPosition();
      this.v.copy(h.hips.getPosition()).sub(rp).mulScalar(this.scale).add(rp);
      this.rootBone.setPosition(this.v);
    }
    for (const x of this.entries) {
      const w = x.from.getRotation();
      if (x.to) this.q.slerp(w, x.to.getRotation(), x.t);
      else this.q.copy(w);
      this.q2.mul2(this.q, x.c);
      x.e.setRotation(this.q2);
    }
    // Feet stay flat, pointing where the body points.
    const rr = h.root.getRotation();
    this.q.mul2(rr, Y180);
    for (const f of this.feet) f.setRotation(this.q);
    void this.v2;
  }

  /** World-space point in the right palm (e.g. for a held ball): `out` = palm + offset along the palm normal. */
  palm(side: "L" | "R", along: number, out: pc.Vec3, normalDist: number, normal: number[], dir: number[]) {
    const w = this.ath.bone(`wrist.${side}`);
    if (!w) return out.copy(this.h[side === "R" ? "handR" : "handL"].getPosition());
    const rot = w.getRotation();
    const d = rot.transformVector(new pc.Vec3(dir[0], dir[1], dir[2]), this.v2);
    out.copy(w.getPosition()).add(d.mulScalar(along));
    const n = rot.transformVector(new pc.Vec3(normal[0], normal[1], normal[2]), new pc.Vec3());
    return out.add(n.mulScalar(-normalDist));
  }

  destroy() {
    this.ath.destroy();
  }
}

function between(a: pc.Vec3, b: pc.Vec3): pc.Quat {
  const d = a.dot(b);
  if (d < -0.99999) {
    let ax = new pc.Vec3().cross(new pc.Vec3(1, 0, 0), a);
    if (ax.length() < 1e-3) ax = new pc.Vec3().cross(new pc.Vec3(0, 1, 0), a);
    return new pc.Quat().setFromAxisAngle(ax.normalize(), 180);
  }
  const c = new pc.Vec3().cross(a, b);
  return new pc.Quat(c.x, c.y, c.z, 1 + d).normalize();
}
