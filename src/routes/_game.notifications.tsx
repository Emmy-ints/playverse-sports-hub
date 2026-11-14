import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Loader2 } from "lucide-react";
import { useEffect } from "react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";
import { describeConfig } from "@/lib/match-config";
import { useMarkNotificationsRead, useNotifications, type NotificationView } from "@/lib/social";
import { getSport, type SportId } from "@/lib/sports";
import { timeAgo, useNow } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — PLAYVERSE" },
      { name: "description", content: "Challenges, results and friend requests." },
      { property: "og:title", content: "Notifications — PLAYVERSE" },
      { property: "og:description", content: "Challenges, results and friend requests." },
    ],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  return (
    <PageShell title="Notifications" description="Challenges, results and friend requests.">
      <RequireAccount feature="Notifications">
        <NotificationList />
      </RequireAccount>
    </PageShell>
  );
}

function NotificationList() {
  const list = useNotifications();
  const mark = useMarkNotificationsRead();
  const now = useNow(30_000);
  const unread = (list.data ?? []).filter((n) => !n.read_at).length;

  // Opening the page marks everything as read (after a short delay so new items still stand out).
  useEffect(() => {
    if (!unread) return;
    const t = setTimeout(() => mark.mutate(null), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread]);

  if (list.isLoading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (list.isError) return <p role="alert" className="text-sm text-destructive">Couldn't load notifications.</p>;
  if (!list.data?.length) return <EmptyState icon={<Bell />} title="You're all caught up" description="You have no notifications yet." />;

  return (
    <ul className="space-y-2">
      {list.data.map((n) => (
        <li key={n.id} className={cn("glass flex flex-wrap items-center gap-3 rounded-2xl p-4", !n.read_at && "ring-2 ring-primary/50")}>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{describe(n).text}</p>
            <p className="text-xs text-muted-foreground">{timeAgo(n.created_at, now)}</p>
          </div>
          {describe(n).action}
        </li>
      ))}
    </ul>
  );
}

function from(n: NotificationView): string {
  const f = n.payload["from"] as { display_name?: string; username?: string } | undefined;
  return f?.display_name ?? f?.username ?? "A player";
}

function describe(n: NotificationView): { text: string; action?: React.ReactNode } {
  const sport = n.payload["sport"] as SportId | undefined;
  const sportName = sport ? (getSport(sport)?.name ?? sport) : "";
  switch (n.type) {
    case "friend_request":
      return { text: `${from(n)} sent you a friend request.`, action: <GameButton asChild size="sm" variant="primary"><Link to="/friends">View</Link></GameButton> };
    case "friend_accepted":
      return { text: `${from(n)} is now your friend.` };
    case "match_invitation": {
      const cfg = (n.payload["config"] ?? {}) as { mode?: string; length?: number };
      return {
        text: `${from(n)} challenged you to ${sportName}${sport ? ` (${describeConfig(sport, cfg)})` : ""}.`,
        action: <GameButton asChild size="sm" variant="hot"><Link to="/invitations">Respond</Link></GameButton>,
      };
    }
    case "match_accepted": {
      const matchId = n.payload["match_id"] as string | undefined;
      return {
        text: `${from(n)} accepted your ${sportName} challenge.`,
        action: matchId ? <GameButton asChild size="sm" variant="hot"><Link to="/lobby/$matchId" params={{ matchId }}>Go to lobby</Link></GameButton> : undefined,
      };
    }
    case "room_joined": {
      const matchId = n.payload["match_id"] as string | undefined;
      return {
        text: `${from(n)} joined your ${sportName} room.`,
        action: matchId ? <GameButton asChild size="sm" variant="hot"><Link to="/lobby/$matchId" params={{ matchId }}>Go to lobby</Link></GameButton> : undefined,
      };
    }
    case "match_declined":
      return { text: `${from(n)} declined your ${sportName} challenge.` };
    case "match_result": {
      const matchId = n.payload["match_id"] as string | undefined;
      const won = n.payload["won"] === true, draw = n.payload["draw"] === true;
      const score = n.payload["score"], opp = n.payload["opponent_score"];
      return {
        text: `${draw ? "Draw" : won ? "You won" : "You lost"} your ${sportName} match ${String(score)}–${String(opp)}.`,
        action: matchId && sport === "bowling" ? <GameButton asChild size="sm" variant="primary"><Link to="/match/bowling/$matchId" params={{ matchId }}>View</Link></GameButton>
          : matchId && sport === "golf" ? <GameButton asChild size="sm" variant="primary"><Link to="/match/golf/$matchId" params={{ matchId }}>View</Link></GameButton>
          : <GameButton asChild size="sm" variant="glass"><Link to="/history">History</Link></GameButton>,
      };
    }
    case "tournament_joined": {
      const id = n.payload["tournament_id"] as string;
      return { text: `${from(n)} joined your tournament “${String(n.payload["name"] ?? "")}”.`, action: <GameButton asChild size="sm" variant="primary"><Link to="/tournament/$tournamentId" params={{ tournamentId: id }}>View</Link></GameButton> };
    }
    case "tournament_match": {
      const matchId = n.payload["match_id"] as string;
      return { text: `Tournament “${String(n.payload["name"] ?? "")}”: your round ${String(n.payload["round"] ?? "")} match vs ${from(n)} is ready.`, action: <GameButton asChild size="sm" variant="hot"><Link to="/lobby/$matchId" params={{ matchId }}>Play</Link></GameButton> };
    }
    case "tournament_finished": {
      const id = n.payload["tournament_id"] as string;
      const w = n.payload["winner"] as { display_name?: string } | undefined;
      return { text: n.payload["won"] === true ? `You won the tournament “${String(n.payload["name"] ?? "")}”! 🏆` : `“${String(n.payload["name"] ?? "")}” is over — ${w?.display_name ?? "a friend"} is champion.`, action: <GameButton asChild size="sm" variant="primary"><Link to="/tournament/$tournamentId" params={{ tournamentId: id }}>Bracket</Link></GameButton> };
    }
    case "achievement":
      return { text: `Achievement unlocked: ${String(n.payload["achievement"] ?? "").replace(/_/g, " ")}!`, action: <GameButton asChild size="sm" variant="glass"><Link to="/achievements">See all</Link></GameButton> };
    default:
      return { text: "Notification" };
  }
}
