/** Tennis venues: the court surface drives the physics; the rest is presentation. */
import type { Surface } from "./sim.ts";

export interface CourtTheme {
  id: "hard" | "clay" | "grass" | "indoor" | "night";
  name: string;
  blurb: string;
  surface: Surface;
  court: string;
  runoff: string;
  line: string;
  wall: string;
  hdr: string;
  skyIntensity: number;
  sunDir: [number, number, number];
  sunColor: [number, number, number];
  sunIntensity: number;
  ambient: [number, number, number];
  night: boolean;
  roof: boolean;
}

export const COURT_THEMES: Record<CourtTheme["id"], CourtTheme> = {
  hard: {
    id: "hard", name: "Harbour Hard Court", blurb: "Fast, true bounce under the sun.", surface: "hard",
    court: "#2d5f9e", runoff: "#3c7a5a", line: "#f4f6f8", wall: "#123a2c",
    hdr: "/assets/env/oceanfront.hdr", skyIntensity: 1, sunDir: [-0.45, -0.8, -0.35], sunColor: [1, 0.96, 0.9], sunIntensity: 1.6,
    ambient: [0.2, 0.22, 0.26], night: false, roof: false,
  },
  clay: {
    id: "clay", name: "Terre Battue", blurb: "Slow, high bounce. Long rallies.", surface: "clay",
    court: "#c1602e", runoff: "#b65a2b", line: "#f1ece4", wall: "#1d4a35",
    hdr: "/assets/env/countryside.hdr", skyIntensity: 1, sunDir: [0.5, -0.75, -0.3], sunColor: [1, 0.93, 0.82], sunIntensity: 1.5,
    ambient: [0.22, 0.2, 0.2], night: false, roof: false,
  },
  grass: {
    id: "grass", name: "Lawn Club", blurb: "Low, skidding bounce. Rewards attack.", surface: "grass",
    court: "#4f8c3a", runoff: "#4a8537", line: "#fbfbf6", wall: "#1e4d2b",
    hdr: "/assets/env/countryside.hdr", skyIntensity: 1, sunDir: [-0.3, -0.85, 0.4], sunColor: [1, 0.97, 0.9], sunIntensity: 1.5,
    ambient: [0.2, 0.22, 0.22], night: false, roof: false,
  },
  indoor: {
    id: "indoor", name: "Arena Indoor", blurb: "Quick court, no wind, big crowd.", surface: "indoor",
    court: "#25407a", runoff: "#3a2f6e", line: "#f2f4ff", wall: "#0d1230",
    hdr: "/assets/env/night.hdr", skyIntensity: 0.15, sunDir: [0, -1, 0.05], sunColor: [1, 0.98, 0.95], sunIntensity: 1.1,
    ambient: [0.32, 0.32, 0.38], night: false, roof: true,
  },
  night: {
    id: "night", name: "Night Session", blurb: "Hard court under the floodlights.", surface: "hard",
    court: "#2a5590", runoff: "#2e5c48", line: "#f4f6f8", wall: "#0b2a20",
    hdr: "/assets/env/night.hdr", skyIntensity: 0.55, sunDir: [0.2, -1, 0.1], sunColor: [0.92, 0.95, 1], sunIntensity: 0.35,
    ambient: [0.1, 0.11, 0.16], night: true, roof: false,
  },
};
