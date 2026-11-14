/**
 * Drives a realistic Athlete from a (hidden) classic Humanoid every frame. Each sport's existing
 * procedural animator keeps posing the humanoid's simple joint rig; this copies that motion onto the
 * athlete's skeleton (direction-corrected per limb, scaled to the athlete's size), so every sport
 * gets realistic bodies without rewriting its animation or gameplay.
 */
import * as pc from "playcanvas";
import type { Humanoid } from "./humanoid.ts";
import { Athlete, athleteBody, loadAthleteAssets, type AthleteAssets } from "./athlete.ts";
import type { AvatarConfig } from "@/lib/avatar";
import { getGameSettings } from "@/lib/game-settings";

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
    // Match the classic rig's size so cameras, props and hit points framed for it still line up.
    const k = this.rootBone ? HUMANOID_HIP_Y / modelPos(this.rootBone).y : 1;
    ath.model.setLocalScale(k, k, k);
    this.scale = 1;
    // Follow the humanoid's root.
    if (h.root.parent) ath.root.reparent(h.root.parent);
    this.hideSource();
  }

  /** Hide the classic meshes (call again after the humanoid is re-styled). */
  hideSource() {
    this.h.setBodyVisible(false);
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
    // Two-bone IK: put each athlete wrist exactly where the classic rig's hand is, bending the elbow
    // toward the classic elbow, so props held by the classic hands (clubs, javelins) sit in the grip.
    for (const s of ["L", "R"] as const) this.armIK(s);
    // Feet stay flat, pointing where the body points.
    const rr = h.root.getRotation();
    this.q.mul2(rr, Y180);
    for (const f of this.feet) f.setRotation(this.q);
    void this.v2;
  }

  private ik = { sh: new pc.Vec3(), el: new pc.Vec3(), wr: new pc.Vec3(), t: new pc.Vec3(), pole: new pc.Vec3(), e: new pc.Vec3(), d1: new pc.Vec3(), d2: new pc.Vec3(), q: new pc.Quat(), wq: new pc.Quat() };
  private armIK(side: "L" | "R") {
    const a = this.ath;
    const up = a.bone(`upperarm01.${side}`), lo = a.bone(`lowerarm01.${side}`), wr = a.bone(`wrist.${side}`);
    if (!up || !lo || !wr) return;
    const k = this.ik;
    const hand = side === "L" ? this.h.handL : this.h.handR;
    const elbow = side === "L" ? this.h.elbowL : this.h.elbowR;
    k.wq.copy(wr.getRotation());
    k.sh.copy(up.getPosition());
    k.el.copy(lo.getPosition());
    k.wr.copy(wr.getPosition());
    const la = k.el.distance(k.sh), lb = k.wr.distance(k.el);
    k.t.copy(hand.getPosition());
    // reach: clamp the target onto what the arm can reach
    k.d1.sub2(k.t, k.sh);
    let dist = k.d1.length();
    if (dist < 1e-4) return;
    const maxR = (la + lb) * 0.999, minR = Math.abs(la - lb) + 1e-3;
    if (dist > maxR) dist = maxR;
    if (dist < minR) dist = minR;
    k.d1.normalize();
    // bend plane from the classic elbow
    k.pole.sub2(elbow.getPosition(), k.sh);
    k.pole.sub(k.d2.copy(k.d1).mulScalar(k.pole.dot(k.d1)));
    if (k.pole.lengthSq() < 1e-6) k.pole.sub2(k.el, k.sh).sub(k.d2.copy(k.d1).mulScalar(k.d2.sub2(k.el, k.sh).dot(k.d1)));
    k.pole.normalize();
    const cosA = Math.max(-1, Math.min(1, (la * la + dist * dist - lb * lb) / (2 * la * dist)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    k.e.copy(k.sh).add(k.d2.copy(k.d1).mulScalar(cosA * la)).add(k.pole.clone().mulScalar(sinA * la));
    // rotate the upper arm onto the new elbow, then the forearm onto the target
    const aim = (bone: pc.Entity, from: pc.Vec3, to: pc.Vec3, want: pc.Vec3) => {
      const cur = new pc.Vec3().sub2(to, from).normalize();
      const dst = new pc.Vec3().sub2(want, from).normalize();
      k.q.copy(between(cur, dst)).mul(bone.getRotation());
      bone.setRotation(k.q);
    };
    aim(up, k.sh, k.el, k.e);
    const elNow = lo.getPosition().clone();
    const tgt = k.sh.clone().add(k.d1.clone().mulScalar(dist));
    aim(lo, elNow, wr.getPosition().clone(), tgt);
    wr.setRotation(k.wq);
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
    this.h.setBodyVisible(true);
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

/**
 * Convenience wrapper for sports: loads the athlete models (if Settings → Graphics is Realistic)
 * and mirrors a classic Humanoid onto a realistic athlete with the player's look. Until the models
 * arrive, or if they fail to load, the classic character simply stays visible.
 */
export class RealisticRig {
  mirror: HumanoidMirror | null = null;
  private assets: AthleteAssets | null = null;
  private dead = false;

  constructor(
    app: pc.AppBase,
    private h: Humanoid,
    private look: AvatarConfig | null,
    private opts: { grip?: [number, number]; shadows?: boolean; onReady?: (rig: RealisticRig) => void } = {},
  ) {
    if (getGameSettings().graphics !== "realistic") return;
    loadAthleteAssets(app)
      .then((as) => {
        if (this.dead) return;
        this.assets = as;
        this.build();
        this.opts.onReady?.(this);
      })
      .catch((e) => console.warn("[athletes] realistic models unavailable, using classic", e));
  }

  private build() {
    if (!this.assets) return;
    const parent = this.h.root.parent ?? this.h.root;
    const ath = new Athlete(this.assets, parent, this.look, { shadows: this.opts.shadows ?? true });
    const [gl, gr] = this.opts.grip ?? [0.35, 0.35];
    ath.setGrip("L", gl, gl * 0.8);
    ath.setGrip("R", gr, gr * 0.8);
    this.mirror = new HumanoidMirror(this.h, ath);
  }

  setLook(look: AvatarConfig | null) {
    this.look = look;
    const m = this.mirror;
    if (!m) return;
    if (m.ath.body === athleteBody(look)) {
      m.ath.apply(look);
      m.hideSource();
    } else {
      m.destroy();
      this.mirror = null;
      this.build();
    }
  }

  update() {
    this.mirror?.update();
  }

  destroy() {
    this.dead = true;
    this.mirror?.destroy();
    this.mirror = null;
  }
}
