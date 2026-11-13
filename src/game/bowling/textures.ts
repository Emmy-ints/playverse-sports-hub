/**
 * Procedurally painted textures (original artwork, no external licences): maple lane boards,
 * pin decals, the bowling ball's reactive-resin swirl and the neon masking-unit sign.
 */

function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas unavailable");
  return { c, ctx };
}

/** Small deterministic PRNG so textures look the same every load. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Maple lane: 39 boards across, long grain, slight tone variation per board. Tiles along the lane. */
export function laneWood(boards = 39, width = 1024, height = 2048, tone: "maple" | "deck" = "maple") {
  const { c, ctx } = canvas(width, height);
  const rand = rng(tone === "maple" ? 7 : 11);
  const bw = width / boards;
  const base = tone === "maple" ? [222, 184, 135] : [232, 200, 156];
  for (let b = 0; b < boards; b++) {
    const v = (rand() - 0.5) * 26;
    ctx.fillStyle = `rgb(${base[0]! + v},${base[1]! + v * 0.9},${base[2]! + v * 0.7})`;
    ctx.fillRect(b * bw, 0, bw + 1, height);
    // Grain streaks.
    for (let g = 0; g < 26; g++) {
      const x = b * bw + rand() * bw;
      const a = 0.04 + rand() * 0.08;
      ctx.strokeStyle = `rgba(120,70,30,${a})`;
      ctx.lineWidth = 0.6 + rand() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      let y = 0;
      while (y < height) {
        y += 40 + rand() * 80;
        ctx.lineTo(x + (rand() - 0.5) * 3, y);
      }
      ctx.stroke();
    }
    // Board seam.
    ctx.fillStyle = "rgba(90,55,25,0.35)";
    ctx.fillRect(b * bw, 0, 1, height);
  }
  return c;
}

/** Gloss variation for the lane (oil streaks). */
export function laneGloss(width = 256, height = 1024) {
  const { c, ctx } = canvas(width, height);
  const rand = rng(3);
  ctx.fillStyle = "rgb(225,225,225)";
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < 160; i++) {
    ctx.fillStyle = `rgba(${rand() > 0.5 ? 255 : 170},${rand() > 0.5 ? 255 : 170},${rand() > 0.5 ? 255 : 170},0.08)`;
    ctx.fillRect(rand() * width, rand() * height, 1 + rand() * 4, 40 + rand() * 300);
  }
  return c;
}

/** Pin decal along the pin's height (v = 0 base … 1 top): white body, two red neck stripes. */
export function pinDecal() {
  const { c, ctx } = canvas(64, 512);
  ctx.fillStyle = "#f7f5f0";
  ctx.fillRect(0, 0, 64, 512);
  // Canvas y=0 is the top of the pin (v = 1).
  const band = (fromIn: number, toIn: number) => {
    const y0 = 512 * (1 - toIn / 15);
    const y1 = 512 * (1 - fromIn / 15);
    ctx.fillStyle = "#c8102e";
    ctx.fillRect(0, y0, 64, y1 - y0);
  };
  band(9.6, 10.05);
  band(10.45, 10.9);
  return c;
}

/** Reactive-resin ball cover: deep swirling colours. */
export function ballSwirl(colors: [string, string, string] = ["#0a2a6b", "#1e6bff", "#0a0f2b"]) {
  const { c, ctx } = canvas(512, 256);
  const rand = rng(21);
  const grd = ctx.createLinearGradient(0, 0, 512, 256);
  grd.addColorStop(0, colors[0]);
  grd.addColorStop(0.5, colors[1]);
  grd.addColorStop(1, colors[2]);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) {
    ctx.strokeStyle = `${colors[rand() > 0.5 ? 1 : 2]}${Math.round(40 + rand() * 120).toString(16).padStart(2, "0")}`;
    ctx.lineWidth = 4 + rand() * 18;
    ctx.beginPath();
    const x = rand() * 512, y = rand() * 256;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + (rand() - 0.5) * 300, y + (rand() - 0.5) * 200, x + (rand() - 0.5) * 300, y + (rand() - 0.5) * 200, x + (rand() - 0.5) * 400, y + (rand() - 0.5) * 120);
    ctx.stroke();
  }
  return c;
}

/** Neon sign for the masking unit above the pins. */
export function maskingSign(text = "PLAYVERSE") {
  const { c, ctx } = canvas(1024, 256);
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "#070b1d");
  g.addColorStop(1, "#111a3d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.font = "italic 900 150px 'Saira Condensed', 'Arial Narrow', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#2f8bff";
  ctx.shadowBlur = 40;
  ctx.fillStyle = "#7cc4ff";
  ctx.fillText(text, 512, 132);
  ctx.shadowColor = "#ff7a1a";
  ctx.shadowBlur = 25;
  ctx.fillStyle = "#ffd2a8";
  ctx.fillRect(160, 220, 704, 6);
  return c;
}

/** Emissive version of the sign (only the glowing parts). */
export function maskingSignEmissive(text = "PLAYVERSE") {
  const { c, ctx } = canvas(1024, 256);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 1024, 256);
  ctx.font = "italic 900 150px 'Saira Condensed', 'Arial Narrow', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#4aa8ff";
  ctx.fillText(text, 512, 132);
  ctx.fillStyle = "#ff8a2a";
  ctx.fillRect(160, 220, 704, 6);
  return c;
}

/** Carpet for the approach-side floor. */
export function carpet() {
  const { c, ctx } = canvas(512, 512);
  const rand = rng(99);
  ctx.fillStyle = "#14122a";
  ctx.fillRect(0, 0, 512, 512);
  const cols = ["#2f6bff", "#ff7a1a", "#f2c230", "#e0307a"];
  for (let i = 0; i < 90; i++) {
    ctx.strokeStyle = cols[i % cols.length]! + "88";
    ctx.lineWidth = 3;
    const x = rand() * 512, y = rand() * 512, s = 10 + rand() * 30;
    ctx.beginPath();
    if (i % 3 === 0) ctx.arc(x, y, s / 2, 0, Math.PI * 2);
    else { ctx.moveTo(x, y); ctx.lineTo(x + s, y + s * (rand() - 0.5)); }
    ctx.stroke();
  }
  return c;
}
