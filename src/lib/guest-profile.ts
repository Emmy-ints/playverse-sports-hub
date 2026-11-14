import { z } from "zod";
import { createLocalStore } from "./local-store";

/** Local guest progression. Starts honestly at zero; real progression arrives with the player database. */
export const guestProfileSchema = z.object({
  level: z.number().int().min(1),
  xp: z.number().int().min(0),
  coins: z.number().int().min(0),
});
export type GuestProfile = z.infer<typeof guestProfileSchema>;

export const NEW_GUEST: GuestProfile = { level: 1, xp: 0, coins: 0 };

/** XP needed to go from `level` to `level + 1`. */
export function xpForNextLevel(level: number): number {
  return 100 + (level - 1) * 50;
}

/** XP earned inside the current level. Server profiles store lifetime XP; guest XP may already be per-level. */
export function xpIntoLevel(xp: number, level: number): number {
  const before = 100 * (level - 1) + (50 * (level - 1) * (level - 2)) / 2;
  const into = xp - before;
  return into >= 0 && into < xpForNextLevel(level) ? into : Math.min(xp, xpForNextLevel(level));
}

export const guestStore = createLocalStore<GuestProfile>("playverse.guest.v1", NEW_GUEST, (raw) => {
  const r = guestProfileSchema.safeParse(raw);
  return r.success ? r.data : null;
});
