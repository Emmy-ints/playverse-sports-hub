import { Link } from "@tanstack/react-router";
import { Bell, Coins, Users } from "lucide-react";
import { avatarStore } from "@/lib/avatar";
import { guestStore, xpForNextLevel } from "@/lib/guest-profile";
import { PlayerBadge } from "./PlayerBadge";
import { StatPill } from "./StatPill";
import { XPBar } from "./XPBar";

export function TopBar() {
  const avatar = avatarStore.useValue();
  const guest = guestStore.useValue();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/75 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link to="/profile" className="flex min-w-0 items-center gap-3 rounded-xl pr-2 transition-colors hover:bg-secondary/60">
          <PlayerBadge avatar={avatar} name={avatar?.nickname ?? "Guest"} level={guest.level} size="sm" />
        </Link>
        <XPBar xp={guest.xp} max={xpForNextLevel(guest.level)} className="hidden max-w-40 md:block" />
        <div className="ml-auto flex items-center gap-2">
          <StatPill icon={<Coins />} label="Coins" value={guest.coins} tone="gold" />
          <Link to="/friends" aria-label="Friends: none online" className="glass hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm sm:flex">
            <Users className="size-4 text-success" aria-hidden /><span className="font-display font-bold">0</span><span className="text-xs text-muted-foreground">online</span>
          </Link>
          <Link to="/notifications" aria-label="Notifications (none)" className="glass flex size-10 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95">
            <Bell className="size-5" aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
