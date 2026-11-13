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

export const guestStore = createLocalStore<GuestProfile>("playverse.guest.v1", NEW_GUEST, (raw) => {
  const r = guestProfileSchema.safeParse(raw);
  return r.success ? r.data : null;
});
