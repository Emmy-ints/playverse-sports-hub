import { z } from "zod";
import { createLocalStore } from "./local-store";

export const settingsSchema = z.object({
  sound: z.boolean(),
  music: z.boolean(),
  haptics: z.boolean(),
  reducedMotion: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
export const DEFAULT_SETTINGS: Settings = { sound: true, music: true, haptics: true, reducedMotion: false };
export const settingsStore = createLocalStore<Settings>("playverse.settings.v1", DEFAULT_SETTINGS, (raw) => {
  const r = settingsSchema.safeParse(raw);
  return r.success ? r.data : null;
});
