import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { PlayerSummary } from "@/lib/social";
import { AvatarPreview } from "./AvatarPreview";
import { PresenceDot } from "./PresenceDot";

export function PlayerRow({ player, actions, showPresence = true }: { player: PlayerSummary; actions?: ReactNode; showPresence?: boolean }) {
  return (
    <li className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
      <Link to="/players/$username" params={{ username: player.username }} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl hover:opacity-90">
        <span className="relative size-12 shrink-0 overflow-hidden rounded-full bg-navy-deep ring-2 ring-primary/40">
          {player.avatar_config ? (
            <AvatarPreview config={player.avatar_config} headOnly />
          ) : (
            <span className="flex h-full items-center justify-center font-display text-lg font-bold">{player.display_name.charAt(0).toUpperCase()}</span>
          )}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-display text-lg font-bold leading-tight">{player.display_name}</span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>@{player.username}</span>
            <span>Lv {player.level}</span>
            {showPresence && <PresenceDot userId={player.id} withLabel />}
          </span>
        </span>
      </Link>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </li>
  );
}
