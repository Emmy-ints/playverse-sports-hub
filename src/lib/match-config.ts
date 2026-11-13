import { z } from "zod";
import type { SportId } from "./sports";

/** Allowed challenge formats per sport. Mirrors public.normalize_match_config on the server (the server is authoritative). */
export const MATCH_FORMATS = {
  tennis: {
    modes: [
      { id: "quick", label: "Quick match", hint: "Short sets to 4 games" },
      { id: "standard", label: "Standard", hint: "Full sets to 6 games" },
    ],
    lengths: [1, 3, 5],
    unit: (n: number) => (n === 1 ? "1 set" : `Best of ${n} sets`),
    defaultMode: "quick",
    defaultLength: 1,
  },
  bowling: {
    modes: [{ id: "frames", label: "Classic", hint: "Standard ten-pin scoring" }],
    lengths: [3, 5, 10],
    unit: (n: number) => `${n} frames`,
    defaultMode: "frames",
    defaultLength: 10,
  },
  golf: {
    modes: [
      { id: "stroke", label: "Stroke play", hint: "Fewest total strokes wins" },
      { id: "match_play", label: "Match play", hint: "Win the most holes" },
    ],
    lengths: [3, 9, 18],
    unit: (n: number) => `${n} holes`,
    defaultMode: "stroke",
    defaultLength: 3,
  },
  racing: {
    modes: [
      { id: "race", label: "Head-to-head race", hint: "First across the line" },
      { id: "time_trial", label: "Time trial", hint: "Fastest total time" },
    ],
    lengths: [1, 3, 5],
    unit: (n: number) => (n === 1 ? "1 lap" : `${n} laps`),
    defaultMode: "race",
    defaultLength: 3,
  },
} as const satisfies Record<SportId, { modes: readonly { id: string; label: string; hint: string }[]; lengths: readonly number[]; unit: (n: number) => string; defaultMode: string; defaultLength: number }>;

export const matchConfigSchema = z.object({
  mode: z.string(),
  length: z.number().int(),
  public: z.boolean(),
  rules: z.string().trim().max(200, "Keep rules under 200 characters").optional(),
});
export type MatchConfig = z.infer<typeof matchConfigSchema>;

/** Client-side check before sending; the server re-validates. */
export function isValidConfig(sport: SportId, cfg: MatchConfig): boolean {
  const f = MATCH_FORMATS[sport];
  const modeOk = (f.modes as readonly { id: string }[]).some((m) => m.id === cfg.mode);
  const lengthOk = (f.lengths as readonly number[]).includes(cfg.length);
  return modeOk && lengthOk && matchConfigSchema.safeParse(cfg).success;
}

export function describeConfig(sport: SportId, cfg: { mode?: unknown; length?: unknown }): string {
  const f = MATCH_FORMATS[sport];
  const mode = (f.modes as readonly { id: string; label: string }[]).find((m) => m.id === cfg.mode)?.label ?? String(cfg.mode ?? "");
  const len = typeof cfg.length === "number" ? f.unit(cfg.length) : "";
  return [mode, len].filter(Boolean).join(" · ");
}
