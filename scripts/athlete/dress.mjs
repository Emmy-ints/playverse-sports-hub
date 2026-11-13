import { buildBody, vertexNormals } from "./body.mjs";
import { fields, clipShell, toTris, eyes, skinColors, makeShoe } from "./kit.mjs";
import { renderViews } from "./preview.mjs";
export function dress(b, g) {
  const N = vertexNormals(b.pos, b.quads);
  const F = fields(b);
  const tris = toTris(b.quads);
  const top = clipShell(b, N, tris, F.top, { offsetArr: F.sleeve.map((s) => 0.01 + 0.01 * Math.max(0, 1 - s)), smooth: 12, minOffset: 0.007 });
  const hipY = b.bones['upperleg01.L'].head[1];
  const bot = clipShell(b, N, tris, F.bottom, { offsetArr: F.thigh.map((t, i) => b.pos[i][1] > hipY ? 0.006 : 0.008 + 0.02 * Math.max(0, Math.min(1, t))), smooth: 8, minOffset: 0.006 });
  const socksF = F.socks.map((f, i) => Math.min(f, b.pos[i][1] - 0.05));
  const socks = clipShell(b, N, tris, socksF, { offsetArr: F.socks.map(() => 0.003), smooth: 2, minOffset: 0.0025 });
  const shoes0 = 0 && clipShell(b, N, tris, F.shoes, { offsetArr: F.shoes.map(() => 0.012), smooth: 60, minOffset: 0.007, collide: F.shoes.map((f, i) => (f > -0.03 ? i : -1)).filter((i) => i >= 0), post: (p, base) => (base[1] < 0.025 ? [p[0], p[1] - 0.016 * (1 - base[1] / 0.025), p[2]] : p) });
  const shoeL = makeShoe(b, F, 'L'), shoeR = makeShoe(b, F, 'R');
  const shoes = { pos: [...shoeL.pos, ...shoeR.pos], tris: [...shoeL.tris, ...shoeR.tris.map((t) => t.map((i) => i + shoeL.pos.length))], skin: [...shoeL.skin, ...shoeR.skin], part: [...shoeL.part, ...shoeR.part] };
  const hair = clipShell(b, N, tris, F.scalp, { offsetArr: F.scalp.map((s) => Math.min(0.012, 0.002 + Math.max(0, s) * 0.6)), smooth: 4, minOffset: 0.0015 });
  const hide = (tr) => [F.top, F.bottom, F.socks, F.shoes].some((f) => tr.every((i) => f[i] >= 0));
  const skinT = tris.filter((t) => !hide(t));
  return { N, F, top, bot, socks, shoes, hair, skinT, sc: skinColors(b, N, b.quads, g), eyes: eyes(b) };
}
if (process.argv[1].endsWith("t2.mjs"))
for (const [name, p, g] of [["m", { gender: 1, muscle: 0.85, height: 0.62 }, 1], ["f", { gender: 0, muscle: 0.62, height: 0.56 }, 0]]) {
  const b = buildBody(p);
  const d = dress(b, g);
  const tone = [0.83, 0.6, 0.45];
  const parts = [
    { pos: b.pos, tris: d.skinT, color: (i) => d.sc[i].map((x, k) => x * tone[k]) },
    { pos: d.top.pos, tris: d.top.tris, color: [0.15, 0.4, 0.9], doubleSided: true },
    { pos: d.bot.pos, tris: d.bot.tris, color: [0.95, 0.95, 0.97], doubleSided: true },
    { pos: d.socks.pos, tris: d.socks.tris, color: [1, 1, 1], doubleSided: true },
    { pos: d.shoes.pos, tris: d.shoes.tris, color: (i) => d.shoes.part[i] ? [0.95,0.95,0.95] : [0.9, 0.4, 0.1] },
    { pos: d.hair.pos, tris: d.hair.tris, color: [0.12, 0.08, 0.06], doubleSided: true },
    { pos: d.eyes.pos, tris: toTris(d.eyes.quads), color: [0.9, 0.9, 0.9] },
  ];
  const hy = b.bones.head.head[1] + 0.08;
  renderViews(parts, [{ yaw: 0 }, { yaw: 90 }, { yaw: 180 }, { yaw: 25, center: [0, hy, 0.05], height: 0.32 }, { yaw: 100, center: [0, hy, 0.0], height: 0.32 }, { yaw: 200, center: [0, hy, 0.0], height: 0.32 }, {yaw: 60, pitch: 20, center:[0.1,0.08,0.05], height:0.4}], { file: `/tmp/ath/kit_${name}.png`, w: 240, h: 460, center: [0, 0.95, 0], height: 2.0 });
}
