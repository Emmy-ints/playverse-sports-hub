import { useSyncExternalStore } from "react";
import { getGameSettings } from "./game-settings";

/**
 * Which controls to show: touch (on-screen buttons) or keyboard hints.
 * Starts from the device's primary pointer, then follows what the player actually uses:
 * a finger on the screen switches to touch, a key press switches back. Tablets with keyboards
 * and touch-screen laptops therefore always show the right controls.
 * `?touch=1` / `?touch=0` in the URL forces a mode (handy for testing).
 */
type Mode = "touch" | "keyboard";

let mode: Mode | null = null;
const listeners = new Set<() => void>();

function initial(): Mode {
  if (typeof window === "undefined") return "keyboard";
  const forced = new URLSearchParams(window.location.search).get("touch");
  if (forced === "1") return "touch";
  if (forced === "0") return "keyboard";
  const mq = (q: string) => window.matchMedia?.(q).matches ?? false;
  if (mq("(pointer: coarse)")) return "touch";
  if (mq("(any-pointer: coarse)") && !mq("(hover: hover)")) return "touch";
  return "keyboard";
}

function set(m: Mode) {
  if (mode === m) return;
  mode = m;
  for (const l of listeners) l();
}

let started = false;
function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  mode ??= initial();
  window.addEventListener("pointerdown", (e) => e.pointerType === "touch" && set("touch"), { capture: true, passive: true });
  window.addEventListener("touchstart", () => set("touch"), { capture: true, passive: true });
  window.addEventListener("keydown", (e) => {
    // Ignore modifier-only presses and keys a phone's on-screen keyboard might send.
    if (e.key.length === 1 || e.key.startsWith("Arrow") || e.key === " ") set("keyboard");
  }, { capture: true });
}

function subscribe(cb: () => void) {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getInputMode(): Mode {
  start();
  return mode ?? "keyboard";
}

/** True when on-screen touch controls should be shown. */
export function useTouchMode(): boolean {
  return useSyncExternalStore(subscribe, () => getInputMode() === "touch", () => false);
}

/** Short vibration on phones that support it (Android). Silently does nothing elsewhere. */
export function buzz(ms: number | number[] = 12) {
  try {
    if (getInputMode() === "touch" && getGameSettings().haptics) navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
