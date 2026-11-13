import tennis from "@/assets/sport-tennis.jpg";
import bowling from "@/assets/sport-bowling.jpg";
import golf from "@/assets/sport-golf.jpg";
import racing from "@/assets/sport-racing.jpg";

export type SportId = "tennis" | "bowling" | "golf" | "racing";

export interface Sport {
  id: SportId;
  name: string;
  venue: string;
  tagline: string;
  description: string;
  image: string;
  modes: string[];
  maxPlayers: number;
  /** Tailwind token suffix for the sport's mood color. */
  tone: "tennis" | "bowling" | "golf" | "racing";
}

export const SPORTS: Sport[] = [
  { id: "tennis", name: "Tennis", venue: "Tennis Arena", tagline: "Serve. Rally. Dominate.", description: "Fast reflex duels on floodlit hard courts.", image: tennis, modes: ["Quick Match", "1v1 Online", "Practice"], maxPlayers: 2, tone: "tennis" },
  { id: "bowling", name: "Bowling", venue: "Bowling Zone", tagline: "Roll for the strike.", description: "Neon lanes, spin control and perfect-game pressure.", image: bowling, modes: ["Quick Match", "Up to 4 Online", "Practice"], maxPlayers: 4, tone: "bowling" },
  { id: "golf", name: "Golf", venue: "Golf World", tagline: "Read the green. Sink it.", description: "Coastal courses, wind reads and clutch putts.", image: golf, modes: ["Stroke Play", "Up to 4 Online", "Driving Range"], maxPlayers: 4, tone: "golf" },
  { id: "racing", name: "Racing", venue: "Racing Circuit", tagline: "Every corner counts.", description: "High-speed night circuits and photo finishes.", image: racing, modes: ["Time Trial", "Up to 8 Online", "Practice"], maxPlayers: 8, tone: "racing" },
];

export function getSport(id: string): Sport | undefined {
  return SPORTS.find((s) => s.id === id);
}
