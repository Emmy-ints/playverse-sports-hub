import { createFileRoute, Link } from "@tanstack/react-router";
import { History, Loader2, Trophy } from "lucide-react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";
import { flag, useHistory, type HistoryRow } from "@/lib/competitive";
import { describeConfig } from "@/lib/match-config";
import { getSport } from "@/lib/sports";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/history")({
  head: () => ({
    meta: [
      { title: "Match history — PLAYVERSE" },
      { name: "description", content: "Every match you have played across all four sports." },
      { property: "og:title", content: "Match history — PLAYVERSE" },
      { property: "og:description", content: "Every match you have played across all four sports." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Match history" description="Every online match you have played, verified by the server.">
      <RequireAccount feature="Match history">
        <HistoryList />
      </RequireAccount>
    </PageShell>
  );
}

function scoreText(r: HistoryRow): string | null {
  const s = r.scores as Record<string, unknown> | null;
  if (!s) return null;
  if (r.sport === "tennis" && Array.isArray(s["history"])) return (s["history"] as [number, number][]).map((h) => h.join("–")).join("  ") || null;
  if (r.sport === "parkour" && s["players"] && typeof s["players"] === "object") {
    const t = Object.values(s["players"] as Record<string, { time?: number | null }>).map((p) => (p.time ? `${p.time.toFixed(2)} s` : "DNF"));
    return t.length === 2 ? t.join(" vs ") : null;
  }
  if (r.sport === "athletics" && s["players"] && typeof s["players"] === "object") {
    const pts = Object.values(s["players"] as Record<string, { points?: number }>).map((p) => p.points ?? 0);
    return pts.length === 2 ? `${pts[0]} – ${pts[1]} pts` : null;
  }
  if (r.sport === "racing" && s["results"]) return `Track: ${String(s["track"] ?? "")}`;
  if (typeof s === "object") {
    const vals = Object.values(s).filter((v) => typeof v === "number") as number[];
    if (vals.length === 2) return `${vals[0]} – ${vals[1]}`;
  }
  return null;
}

function HistoryList() {
  const q = useHistory();
  if (q.isLoading) return <div className="flex justify-center py-16" role="status"><Loader2 className="size-8 animate-spin text-primary" aria-label="Loading history" /></div>;
  if (q.isError) return <p role="alert" className="text-destructive">Couldn't load your history. Check your connection.</p>;
  const rows = q.data ?? [];
  if (rows.length === 0) {
    return <EmptyState icon={<History />} title="No matches played yet" description="Challenge a friend — completed online matches appear here with the result, score and rating change."
      action={<GameButton asChild variant="hot"><Link to="/friends">Challenge a friend</Link></GameButton>} />;
  }
  const wins = rows.filter((r) => r.won).length, losses = rows.filter((r) => !r.won && !r.draw).length;
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-3 text-sm">
        <span className="glass rounded-full px-4 py-1.5"><b className="text-success">{wins}</b> wins</span>
        <span className="glass rounded-full px-4 py-1.5"><b className="text-destructive">{losses}</b> losses</span>
        <span className="glass rounded-full px-4 py-1.5"><b>{rows.length}</b> matches</span>
      </div>
      <ul className="grid gap-3">
        {rows.map((r) => {
          const sport = getSport(r.sport);
          const result = r.draw ? "Draw" : r.won ? "Win" : "Loss";
          const score = scoreText(r);
          return (
            <li key={r.id} className="glass flex items-center gap-4 rounded-2xl p-3 sm:p-4">
              {sport && <img src={sport.image} alt="" className="size-14 shrink-0 rounded-xl object-cover sm:size-16" />}
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold uppercase leading-tight">
                  {sport?.name ?? r.sport} <span className="text-sm font-normal normal-case text-muted-foreground">· {describeConfig(r.sport, r.config)}</span>
                  {r.tournament_id && <Trophy className="ml-1 inline size-4 text-[#ffd23f]" aria-label="Tournament match" />}
                </p>
                <p className="truncate text-sm text-muted-foreground">
                  vs {r.opponent ? <Link to="/players/$username" params={{ username: r.opponent.username ?? "" }} className="font-semibold text-foreground hover:underline">{flag(r.opponent.country)} {r.opponent.display_name}</Link> : "—"}
                  {" · "}{timeAgo(r.ended_at)}{r.forfeit && " · forfeit"}
                </p>
                {score && <p className="text-xs text-muted-foreground">{score}</p>}
              </div>
              <div className="text-right">
                <span className={cn("rounded-full px-3 py-1 text-xs font-black uppercase", r.draw ? "bg-secondary" : r.won ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive")}>{result}</span>
                {r.rating_change !== null && <p className={cn("mt-1 text-sm font-bold tabular-nums", r.rating_change >= 0 ? "text-success" : "text-destructive")}>{r.rating_change >= 0 ? "+" : ""}{r.rating_change}</p>}
                {r.xp !== null && <p className="text-xs text-muted-foreground">+{r.xp} XP</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
