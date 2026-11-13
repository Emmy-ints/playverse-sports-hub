import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, Loader2 } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { flag, useLeaderboard, type Scope } from "@/lib/competitive";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/rankings")({
  head: () => ({ meta: [
    { title: "Rankings — PLAYVERSE" }, { name: "description", content: "Global and friends leaderboards for every sport." },
    { property: "og:title", content: "Rankings — PLAYVERSE" }, { property: "og:description", content: "Global and friends leaderboards for every sport." },
  ] }),
  component: Page,
});

const SCOPES: { id: Scope; label: string }[] = [
  { id: "overall", label: "Overall" }, { id: "tennis", label: "Tennis" }, { id: "bowling", label: "Bowling" }, { id: "golf", label: "Golf" }, { id: "racing", label: "Racing" },
];
const MEDAL = ["", "🥇", "🥈", "🥉"];

function Page() {
  const [scope, setScope] = useState<Scope>("overall");
  const [friends, setFriends] = useState(false);
  const { session } = useSession();
  const me = session?.user.id;
  const q = useLeaderboard(scope, friends && !!session);
  const data = q.data;
  return (
    <PageShell title="Rankings" description="Ratings from real, server-verified online matches. Nothing here is simulated.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Sport" className="flex flex-wrap gap-1 rounded-2xl bg-secondary p-1">
          {SCOPES.map((s) => (
            <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)}
              className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold", scope === s.id ? "bg-gradient-primary text-primary-foreground" : "hover:bg-muted")}>{s.label}</button>
          ))}
        </div>
        <div role="tablist" aria-label="Who" className="flex gap-1 rounded-2xl bg-secondary p-1">
          {[false, true].map((f) => (
            <button key={String(f)} role="tab" aria-selected={friends === f} disabled={f && !session} onClick={() => setFriends(f)}
              className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40", friends === f ? "bg-gradient-primary text-primary-foreground" : "hover:bg-muted")}>{f ? "Friends" : "Global"}</button>
          ))}
        </div>
      </div>
      {data?.me && (
        <div className="glass mb-4 flex items-center gap-4 rounded-2xl p-4">
          <span className="font-display text-4xl font-black">#{data.me.rank}</span>
          <div><p className="font-semibold">Your rank</p><p className="text-sm text-muted-foreground">{data.me.rating} rating · {data.me.games} rated matches</p></div>
        </div>
      )}
      {q.isLoading ? (
        <div className="flex justify-center py-16" role="status"><Loader2 className="size-8 animate-spin text-primary" aria-label="Loading rankings" /></div>
      ) : q.isError ? (
        <p role="alert" className="text-destructive">Couldn't load rankings. Check your connection.</p>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState icon={<Crown />} title="No ranked players yet" description={friends ? "None of your friends has played a rated match in this sport yet." : "Play an online match to put the first name on the board."}
          action={<GameButton asChild variant="hot"><Link to="/friends">Challenge a friend</Link></GameButton>} />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Player</th><th className="px-3 py-2 text-right">Rating</th><th className="hidden px-3 py-2 text-right sm:table-cell">Played</th><th className="hidden px-3 py-2 text-right sm:table-cell">Wins</th></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.player.id} className={cn("border-t border-white/5", r.player.id === me && "bg-primary/15")}>
                  <td className="px-3 py-2 font-display text-lg font-black">{MEDAL[r.rank] || r.rank}</td>
                  <td className="px-3 py-2">
                    <Link to="/players/$username" params={{ username: r.player.username ?? "" }} className="font-semibold hover:underline">{flag(r.player.country)} {r.player.display_name}</Link>
                    <span className="ml-2 text-xs text-muted-foreground">Lv {r.player.level}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{r.rating}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{r.games}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{r.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
