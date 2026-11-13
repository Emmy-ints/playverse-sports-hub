/**
 * Spectator stands along the side walls: lightweight seated figures (body, head, hair, two arms)
 * that idle, clap and jump up when something big happens.
 */
import * as pc from "playcanvas";

interface Fan {
  root: pc.Entity;
  armL: pc.Entity;
  armR: pc.Entity;
  phase: number;
  side: number;
  baseY: number;
  excitement: number;
}

const SKIN = ["#f6d7c3", "#eac0a0", "#d39b72", "#a8714b", "#7a4b2e", "#4d2e1c"];
const SHIRTS = ["#2f7bff", "#ff7a1a", "#f2c230", "#e8eaf0", "#1d2333", "#e0307a", "#2fbf71", "#8b5cf6", "#ef4444", "#0ea5e9"];
const HAIR = ["#1b1410", "#4a2c1a", "#8a5a2b", "#d8b46a", "#b8361f", "#e8e6e1"];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export class Crowd {
  private fans: Fan[] = [];
  private root: pc.Entity;
  private time = 0;
  private mats = new Map<string, pc.StandardMaterial>();

  constructor(parent: pc.Entity, opts: { innerX: number; zFrom: number; zTo: number; tiers: number; spacing: number; fill: number; shadows: boolean }) {
    this.root = new pc.Entity("crowd");
    parent.addChild(this.root);
    const rand = rng(42);
    const mat = (hex: string, gloss = 0.3) => {
      const key = hex + gloss;
      let m = this.mats.get(key);
      if (!m) {
        m = new pc.StandardMaterial();
        const n = parseInt(hex.slice(1), 16);
        m.diffuse = new pc.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
        m.useMetalness = true;
        m.gloss = gloss;
        m.update();
        this.mats.set(key, m);
      }
      return m;
    };
    const benchMat = mat("#1a1f33", 0.4);
    const add = (p: pc.Entity, type: string, m: pc.Material, pos: [number, number, number], scale: [number, number, number], shadow = false) => {
      const e = new pc.Entity();
      e.addComponent("render", { type, material: m, castShadows: shadow, receiveShadows: true });
      e.setLocalPosition(...pos);
      e.setLocalScale(scale[0], type === "capsule" ? scale[1] / 2 : scale[1], scale[2]);
      p.addChild(e);
      return e;
    };

    for (const side of [-1, 1]) {
      for (let tier = 0; tier < opts.tiers; tier++) {
        const x = side * (opts.innerX + tier * 0.55);
        const seatY = 0.45 + tier * 0.38;
        // Bleacher step.
        add(this.root, "box", benchMat, [x, seatY / 2 - 0.02, (opts.zFrom + opts.zTo) / 2], [0.55, seatY, Math.abs(opts.zFrom - opts.zTo) + 0.6]);
        for (let z = opts.zFrom; z > opts.zTo; z -= opts.spacing) {
          if (rand() > opts.fill) continue;
          const root = new pc.Entity("fan");
          const baseY = seatY;
          root.setLocalPosition(x + (rand() - 0.5) * 0.08, baseY, z + (rand() - 0.5) * 0.2);
          root.setLocalEulerAngles(0, side < 0 ? -90 + (rand() - 0.5) * 30 : 90 + (rand() - 0.5) * 30, 0); // face the lanes
          this.root.addChild(root);
          const shirt = mat(SHIRTS[Math.floor(rand() * SHIRTS.length)]!);
          const skin = mat(SKIN[Math.floor(rand() * SKIN.length)]!, 0.35);
          const hair = mat(HAIR[Math.floor(rand() * HAIR.length)]!, 0.4);
          const scale = 0.9 + rand() * 0.2;
          root.setLocalScale(scale, scale, scale);
          add(root, "capsule", mat("#1d2333"), [0, 0.06, -0.15], [0.26, 0.14, 0.4]); // lap/legs
          add(root, "capsule", shirt, [0, 0.33, 0], [0.34, 0.5, 0.22], opts.shadows);
          add(root, "sphere", skin, [0, 0.7, 0], [0.2, 0.23, 0.21]);
          add(root, "sphere", hair, [0, 0.75, 0.02], [0.21, 0.17, 0.22]);
          const armL = new pc.Entity();
          armL.setLocalPosition(-0.19, 0.52, 0);
          root.addChild(armL);
          add(armL, "capsule", shirt, [0, -0.18, 0], [0.08, 0.38, 0.08]);
          const armR = new pc.Entity();
          armR.setLocalPosition(0.19, 0.52, 0);
          root.addChild(armR);
          add(armR, "capsule", shirt, [0, -0.18, 0], [0.08, 0.38, 0.08]);
          this.fans.push({ root, armL, armR, phase: rand() * Math.PI * 2, side, baseY, excitement: 0 });
        }
      }
    }
  }

  /** Make the crowd react: 1 = big cheer (strike), 0.5 = applause (spare). */
  cheer(level: number) {
    this.fans.forEach((f) => (f.excitement = Math.max(f.excitement, level * (0.7 + Math.random() * 0.3))));
  }

  update(dt: number) {
    this.time += dt;
    for (const f of this.fans) {
      f.excitement = Math.max(0, f.excitement - dt * 0.35);
      const e = f.excitement;
      const t = this.time * (1 + e * 4) + f.phase;
      const p = f.root.getLocalPosition();
      const jump = e > 0.6 ? Math.max(0, Math.sin(t * 2.2)) * 0.18 * e : 0;
      f.root.setLocalPosition(p.x, f.baseY + jump + Math.sin(t * 0.8) * 0.004, p.z);
      // Arms: resting on lap when calm, clapping when excited, waving overhead in a big cheer.
      const raise = e > 0.6 ? 160 : e > 0.15 ? 70 : 20;
      const wave = e > 0.15 ? Math.sin(t * 6) * 25 * e : Math.sin(t) * 3;
      f.armL.setLocalEulerAngles(raise + wave, 0, e > 0.6 ? -20 : 18 - wave * 0.4);
      f.armR.setLocalEulerAngles(raise - wave, 0, e > 0.6 ? 20 : -18 + wave * 0.4);
    }
  }

  destroy() {
    this.root.destroy();
    this.mats.forEach((m) => m.destroy());
  }
}
