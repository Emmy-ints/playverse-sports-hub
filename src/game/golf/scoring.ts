/** Golf scoring helpers (pure; shared with the server). */

/** A hole is picked up at double par (keeps casual matches moving). */
export function maxStrokes(par: number): number {
  return par * 2;
}

export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return "Hole in one!";
  const d = strokes - par;
  if (d <= -3) return "Albatross!";
  if (d === -2) return "Eagle!";
  if (d === -1) return "Birdie!";
  if (d === 0) return "Par";
  if (d === 1) return "Bogey";
  if (d === 2) return "Double bogey";
  if (d === 3) return "Triple bogey";
  return `+${d}`;
}

export function toPar(strokes: readonly (number | null)[], pars: readonly number[]): number {
  return strokes.reduce<number>((s, v, i) => (v === null ? s : s + v - (pars[i] ?? 0)), 0);
}

export function formatToPar(n: number): string {
  return n === 0 ? "E" : n > 0 ? `+${n}` : String(n);
}

/** Match play: holes won by each side (lower score wins the hole; ties halved). */
export function matchPlay(a: readonly (number | null)[], b: readonly (number | null)[]): { a: number; b: number; halved: number } {
  let wa = 0, wb = 0, h = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x == null || y == null) continue;
    if (x < y) wa++;
    else if (y < x) wb++;
    else h++;
  }
  return { a: wa, b: wb, halved: h };
}
