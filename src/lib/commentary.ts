/** Lightweight spoken commentary using the browser's speech voice (no audio files, no network). */
let lastAt = 0;
export function commentate(text: string, opts: { priority?: boolean; minGap?: number } = {}) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const now = performance.now();
  if (!opts.priority && now - lastAt < (opts.minGap ?? 3500)) return;
  lastAt = now;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.08;
    u.pitch = 1.05;
    u.volume = 0.75;
    if (opts.priority) window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  } catch {
    /* speech unavailable */
  }
}
export function stopCommentary() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
