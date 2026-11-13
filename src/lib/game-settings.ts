import { useSyncExternalStore } from "react";

/**
 * Controls & camera settings, shared by every arena and saved on this device.
 * Renderers read them with getGameSettings() each frame; React UI uses useGameSettings().
 */
export type CamMode = "dynamic" | "steady" | "manual";
export type Hand = "right" | "left";
export type Steering = "wheel" | "buttons" | "tilt";
export type RaceView = "chase" | "close" | "bonnet" | "cockpit";

export interface GameSettings {
  /** Touch control size multiplier (0.8–1.4). */
  buttonScale: number;
  /** Manual camera / drag sensitivity (0–1). */
  camSensitivity: number;
  /** Dynamic: camera follows the action; Steady: minimal movement; Manual: you can also drag to look. */
  camMode: CamMode;
  hand: Hand;
  haptics: boolean;
  steering: Steering;
  raceView: RaceView;
  /** Suggest turning the phone sideways in portrait. */
  landscapeHint: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  buttonScale: 1,
  camSensitivity: 0.55,
  camMode: "dynamic",
  hand: "right",
  haptics: true,
  steering: "wheel",
  raceView: "chase",
  landscapeHint: true,
};

const KEY = "pv.gameSettings.v1";
let current: GameSettings | null = null;
const listeners = new Set<() => void>();

function load(): GameSettings {
  if (current) return current;
  let saved: Partial<GameSettings> = {};
  try {
    if (typeof localStorage !== "undefined") saved = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<GameSettings>;
  } catch {
    saved = {};
  }
  const s = { ...DEFAULT_SETTINGS, ...saved };
  // Clamp anything odd that may have been stored.
  s.buttonScale = Math.min(1.4, Math.max(0.8, Number(s.buttonScale) || 1));
  s.camSensitivity = Math.min(1, Math.max(0, Number(s.camSensitivity) || 0.55));
  if (!["dynamic", "steady", "manual"].includes(s.camMode)) s.camMode = "dynamic";
  if (!["right", "left"].includes(s.hand)) s.hand = "right";
  if (!["wheel", "buttons", "tilt"].includes(s.steering)) s.steering = "wheel";
  if (!["chase", "close", "bonnet", "cockpit"].includes(s.raceView)) s.raceView = "chase";
  current = s;
  return s;
}

export function getGameSettings(): GameSettings {
  return typeof window === "undefined" ? DEFAULT_SETTINGS : load();
}

export function setGameSettings(patch: Partial<GameSettings>) {
  current = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* private mode: keep in memory */
  }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = null;
      cb();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useGameSettings(): [GameSettings, (p: Partial<GameSettings>) => void] {
  const s = useSyncExternalStore(subscribe, getGameSettings, () => DEFAULT_SETTINGS);
  return [s, setGameSettings];
}

/** How much the camera should move on its own: 1 for dynamic, less for steady. */
export function camLiveliness(s: GameSettings = getGameSettings()) {
  return s.camMode === "steady" ? 0.35 : 1;
}
