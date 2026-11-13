import { Link } from "@tanstack/react-router";
import { Bell, Coins, Users } from "lucide-react";
import { xpForNextLevel } from "@/lib/guest-profile";
import { usePlayer } from "@/lib/player";
import { usePresenceMap } from "@/lib/presence";
import { useFriends, useNotifications } from "@/lib/social";
import { PlayerBadge } from "./PlayerBadge";
import { StatPill } from "./StatPill";
import { XPBar } from "./XPBar";

export function TopBar() {
  const p = usePlayer();
  const friends = useFriends();
  const notifications = useNotifications();
  const presence = usePresenceMap();
  const online = (friends.data ?? []).filter((f) => presence.has(f.id)).length;
  const unread = (notifications.data ?? []).filter((n) => !n.read_at).length;
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/75 pt-safe backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <Link to="/profile" className="flex min-w-0 items-center gap-3 rounded-xl pr-2 transition-colors hover:bg-secondary/60">
          <PlayerBadge avatar={p.avatar} name={p.name} level={p.level} size="sm" />
        </Link>
        <XPBar xp={p.xp} max={xpForNextLevel(p.level)} className="hidden max-w-40 md:block" />
        <div className="ml-auto flex items-center gap-2">
          <StatPill icon={<Coins />} label="Coins" value={p.coins} tone="gold" />
          {p.isGuest && !p.loading && (
            <Link to="/login" className="hidden h-10 items-center rounded-full bg-gradient-primary px-4 font-display text-sm font-bold uppercase tracking-wider text-primary-foreground sm:inline-flex">
              Log in
            </Link>
          )}
          <Link to="/friends" aria-label={`Friends online: ${online}`} className="glass hidden items-center gap-1.5 rounded-full px-3 py-1.5 text-sm sm:flex">
            <Users className="size-4 text-success" aria-hidden /><span className="font-display font-bold">{online}</span><span className="text-xs text-muted-foreground">online</span>
          </Link>
          <Link to="/notifications" aria-label={unread ? `Notifications (${unread} unread)` : "Notifications"} className="glass relative flex size-10 items-center justify-center rounded-full transition-transform hover:scale-105 active:scale-95">
            <Bell className="size-5" aria-hidden />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-accent px-1 text-center font-display text-xs font-bold leading-5 text-accent-foreground">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
