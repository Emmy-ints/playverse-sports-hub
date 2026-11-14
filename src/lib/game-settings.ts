import { useSyncExternalStore } from "react";

/**
 * Controls & camera settings, shared by every arena and saved on this device.
 * Renderers read them with getGameSettings() each frame; React UI uses useGameSettings().
 */
export type CamMode = "dynamic" | "steady" | "manual";
export type Hand = "right" | "left";
export type Steering = "wheel" | "buttons" | "tilt" | "tap";
export type RaceView = "cockpit" | "driver" | "bonnet" | "bumper" | "close" | "chase" | "far" | "rear" | "side" | "tv";
export type Assist = "off" | "low" | "high";
export type RacingLine = "off" | "corners" | "full";
/** Cameras in cycling order (C key / gamepad Y / camera button). */
export const RACE_VIEWS: { id: RaceView; name: string; hint: string }[] = [
  { id: "cockpit", name: "Cockpit", hint: "Driver's seat: dashboard, wheel and pillars" },
  { id: "driver", name: "Driver", hint: "Helmet view with head movement into corners" },
  { id: "bonnet", name: "Hood", hint: "On the bonnet, road straight ahead" },
  { id: "bumper", name: "Bumper", hint: "Low at the nose: biggest sense of speed" },
  { id: "close", name: "Chase near", hint: "Close behind the car" },
  { id: "chase", name: "Chase", hint: "Classic follow camera" },
  { id: "far", name: "Chase far", hint: "High and wide: best traffic awareness" },
  { id: "rear", name: "Rear", hint: "Looking back at the cars behind" },
  { id: "side", name: "Side", hint: "Beside the wheels: cinematic" },
  { id: "tv", name: "Broadcast", hint: "Trackside TV cameras that follow you" },
];

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
  /** Tilt steering feels reversed on some phones. */
  tiltInvert: boolean;
  /** Realistic motion-captured athletes (arenas that support them) or the classic characters. */
  graphics: Graphics;
  // --- Racing: driving experience ---
  steerAssist: Assist;
  brakeAssist: Assist;
  racingLine: RacingLine;
  /** Camera customisation: field-of-view offset (°), height and distance offsets (m), shake (0–1), look into corners. */
  camFov: number;
  camHeight: number;
  camDistance: number;
  camShake: number;
  lookApex: boolean;
  /** Gamepad rumble strength (0–1). */
  padRumble: number;
}
export type Graphics = "realistic" | "classic";

export const DEFAULT_SETTINGS: GameSettings = {
  buttonScale: 1,
  camSensitivity: 0.55,
  camMode: "dynamic",
  hand: "right",
  haptics: true,
  steering: "wheel",
  raceView: "chase",
  landscapeHint: true,
  tiltInvert: false,
  graphics: "realistic",
  steerAssist: "off",
  brakeAssist: "off",
  racingLine: "corners",
  camFov: 0,
  camHeight: 0,
  camDistance: 0,
  camShake: 0.4,
  lookApex: true,
  padRumble: 0.7,
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
  if (!["wheel", "buttons", "tilt", "tap"].includes(s.steering)) s.steering = "wheel";
  if (!RACE_VIEWS.some((v) => v.id === s.raceView)) s.raceView = "chase";
  for (const k of ["steerAssist", "brakeAssist"] as const) if (!["off", "low", "high"].includes(s[k])) s[k] = "off";
  if (!["off", "corners", "full"].includes(s.racingLine)) s.racingLine = "corners";
  const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  s.camFov = num(s.camFov, -10, 20, 0);
  s.camHeight = num(s.camHeight, -0.6, 1.5, 0);
  s.camDistance = num(s.camDistance, -2, 5, 0);
  s.camShake = num(s.camShake, 0, 1, 0.4);
  s.padRumble = num(s.padRumble, 0, 1, 0.7);
  s.lookApex = s.lookApex !== false;
  if (!["realistic", "classic"].includes(s.graphics)) s.graphics = "realistic";
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
