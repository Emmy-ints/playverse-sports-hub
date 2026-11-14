/** Skill divisions derived from the server-maintained Elo rating (start 1000). */
export interface Division { id: "placement" | "bronze" | "silver" | "gold" | "platinum" | "diamond"; name: string; color: string; min: number; next: number | null }

const TIERS: Division[] = [
  { id: "bronze", name: "Bronze", color: "#cd7f32", min: 0, next: 1100 },
  { id: "silver", name: "Silver", color: "#c8d0da", min: 1100, next: 1250 },
  { id: "gold", name: "Gold", color: "#ffd23f", min: 1250, next: 1400 },
  { id: "platinum", name: "Platinum", color: "#5fe3d0", min: 1400, next: 1600 },
  { id: "diamond", name: "Diamond", color: "#8fb8ff", min: 1600, next: null },
];
/** Rated matches needed before a division is shown. */
export const PLACEMENT_GAMES = 5;

export function divisionOf(rating: number, games: number): Division {
  if (games < PLACEMENT_GAMES) return { id: "placement", name: `Placement ${games}/${PLACEMENT_GAMES}`, color: "#9aa3b2", min: 0, next: null };
  return [...TIERS].reverse().find((t) => rating >= t.min) ?? TIERS[0]!;
}

/** 0..1 progress towards the next division. */
export function divisionProgress(rating: number, d: Division) {
  return d.next ? Math.max(0, Math.min(1, (rating - d.min) / (d.next - d.min))) : 1;
}
