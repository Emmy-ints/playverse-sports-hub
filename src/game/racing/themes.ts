/** Visual themes per track (the track geometry decides the racing; this is presentation). */
import type { TrackDef } from "./track.ts";

export interface RaceTheme {
  track: TrackDef["id"];
  hdr: string;
  skyIntensity: number;
  sunDir: [number, number, number];
  sunColor: [number, number, number];
  sunIntensity: number;
  ambient: [number, number, number];
  ground: string;
  runoff: string;
  asphalt: string;
  barrier: [string, string];
  scenery: "city" | "coast" | "valley";
  night: boolean;
}

export const RACE_THEMES: Record<TrackDef["id"], RaceTheme> = {
  city: {
    track: "city", hdr: "/assets/env/night.hdr", skyIntensity: 0.7, sunDir: [0.3, -1, 0.2], sunColor: [0.75, 0.82, 1], sunIntensity: 0.55,
    ambient: [0.2, 0.2, 0.28], ground: "#1d2230", runoff: "#2b3140", asphalt: "#30333a", barrier: ["#ff2fb3", "#20e3ff"], scenery: "city", night: true,
  },
  coast: {
    track: "coast", hdr: "/assets/env/oceanfront.hdr", skyIntensity: 1, sunDir: [-0.5, -0.75, -0.3], sunColor: [1, 0.95, 0.86], sunIntensity: 1.6,
    ambient: [0.22, 0.24, 0.28], ground: "#d8c9a0", runoff: "#c9b98e", asphalt: "#3b3d42", barrier: ["#e11d48", "#f4f4f4"], scenery: "coast", night: false,
  },
  valley: {
    track: "valley", hdr: "/assets/env/countryside.hdr", skyIntensity: 1, sunDir: [0.45, -0.8, -0.35], sunColor: [1, 0.96, 0.88], sunIntensity: 1.5,
    ambient: [0.2, 0.22, 0.22], ground: "#4f7d34", runoff: "#5e8a3c", asphalt: "#383a3f", barrier: ["#2f7bff", "#f4f4f4"], scenery: "valley", night: false,
  },
  speedway: {
    track: "speedway", hdr: "/assets/env/countryside.hdr", skyIntensity: 0.65, sunDir: [-0.85, -0.3, 0.2], sunColor: [1, 0.62, 0.36], sunIntensity: 1.25,
    ambient: [0.24, 0.17, 0.16], ground: "#6b6a3a", runoff: "#7a6f48", asphalt: "#34353a", barrier: ["#ff7a1a", "#f4f4f4"], scenery: "valley", night: false,
  },
};

export const CAR_COLORS = ["#e11d48", "#2f7bff", "#f2c230", "#2fbf71", "#ff7a1a", "#e8eaf0", "#8b5cf6", "#1d2333"] as const;
