import { z } from "zod";
import { createLocalStore } from "./local-store";

export const GENDER_PRESENTATIONS = ["masculine", "feminine", "neutral"] as const;
export const FACES = ["focused", "smile", "fierce"] as const;
export const HAIRSTYLES = ["buzz", "short", "curly", "long", "ponytail", "mohawk"] as const;
export const OUTFITS = ["jersey", "tennis", "track", "polo"] as const;
export const SHOES = ["runner", "court", "high-top"] as const;
export const ACCESSORIES = ["none", "cap", "headband", "glasses", "wristbands"] as const;

// Avatar palettes are character data rendered into SVG fills, not UI theme colors.
export const SKIN_TONES = ["#f6d7c3", "#eac0a0", "#d39b72", "#a8714b", "#7a4b2e", "#4d2e1c"] as const;
export const HAIR_COLORS = ["#1b1410", "#4a2c1a", "#8a5a2b", "#d8b46a", "#b8361f", "#e8e6e1", "#2f6bff", "#ff7a1a"] as const;
export const KIT_COLORS = ["#2f7bff", "#ff7a1a", "#f2c230", "#e8eaf0", "#1d2333", "#e0307a", "#2fbf71"] as const;

export const NICKNAME_RULE = /^[A-Za-z0-9_]{3,16}$/;

export const avatarConfigSchema = z.object({
  version: z.literal(1),
  nickname: z.string().regex(NICKNAME_RULE, "3–16 letters, numbers or underscores"),
  genderPresentation: z.enum(GENDER_PRESENTATIONS),
  skinTone: z.enum(SKIN_TONES),
  face: z.enum(FACES),
  hairstyle: z.enum(HAIRSTYLES),
  hairColor: z.enum(HAIR_COLORS),
  outfit: z.enum(OUTFITS),
  outfitColor: z.enum(KIT_COLORS),
  shoes: z.enum(SHOES),
  shoeColor: z.enum(KIT_COLORS),
  accessory: z.enum(ACCESSORIES),
});

export type AvatarConfig = z.infer<typeof avatarConfigSchema>;

export const DEFAULT_AVATAR: AvatarConfig = {
  version: 1,
  nickname: "Rookie",
  genderPresentation: "neutral",
  skinTone: SKIN_TONES[2],
  face: "focused",
  hairstyle: "short",
  hairColor: HAIR_COLORS[0],
  outfit: "jersey",
  outfitColor: KIT_COLORS[0],
  shoes: "runner",
  shoeColor: KIT_COLORS[1],
  accessory: "none",
};

/** null = player hasn't created a character yet. */
export const avatarStore = createLocalStore<AvatarConfig | null>("playverse.avatar.v1", null, (raw) => {
  const r = avatarConfigSchema.safeParse(raw);
  return r.success ? r.data : null;
});
