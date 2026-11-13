import { avatarConfigSchema, type AvatarConfig } from "./avatar";

export type Sport = "tennis" | "bowling" | "golf" | "racing" | "athletics" | "parkour";

/** Row shape of public.profiles. XP/level/coins are server-managed (read-only to clients). */
export interface PlayerProfile {
  id: string;
  public_id: string;
  username: string;
  display_name: string;
  avatar_config: AvatarConfig | null;
  country: string | null;
  xp: number;
  level: number;
  coins: number;
  created_at: string;
}

export function parseProfile(row: Record<string, unknown>): PlayerProfile {
  const avatar = avatarConfigSchema.safeParse(row["avatar_config"]);
  return { ...(row as unknown as PlayerProfile), avatar_config: avatar.success ? avatar.data : null };
}
