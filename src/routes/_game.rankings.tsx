import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, Loader2, Sparkles } from "lucide-react";
import { useState } from "react";
import { DivisionBadge } from "@/components/game/DivisionBadge";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { flag, useAllRounder, useLeaderboard, type Scope } from "@/lib/competitive";
import { SPORTS } from "@/lib/sports";
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
  { id: "overall", label: "Overall" }, { id: "tennis", label: "Tennis" }, { id: "bowling", label: "Bowling" }, { id: "golf", label: "Golf" }, { id: "racing", label: "Racing" }, { id: "athletics", label: "Athletics" }, { id: "parkour", label: "Parkour" },
];
const MEDAL = ["", "🥇", "🥈", "🥉"];

function AllRounderBoard({ friends, me }: { friends: boolean; me: string | undefined }) {
  const q = useAllRounder(friends);
  const d = q.data;
  const days = d ? Math.max(0, Math.ceil((new Date(d.ends_at).getTime() - Date.now()) / 86_400_000)) : 0;
  const month = d ? new Date(`${d.season}-01T00:00:00Z`).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) : "";
  return (
    <>
      <div className="glass mb-4 rounded-2xl p-4">
        <p className="flex items-center gap-2 font-display text-xl font-black uppercase"><Sparkles className="size-5 text-gold" aria-hidden /> All-Rounder Championship {month && `· ${month}`}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Every verified online match this month scores: 1 point for playing (up to 10 per sport), 3 per win, 1 per draw, capped at 40 per sport, plus 5 bonus points for every sport you compete in. {d && `${days} day${days === 1 ? "" : "s"} left.`}
        </p>
        {d?.me && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="font-display text-3xl font-black">#{d.me.rank}</span>
            <span className="text-sm">{d.me.points} pts · {d.me.sports}/6 sports</span>
            {SPORTS.filter((s) => !(s.id in d.me!.by_sport)).length > 0 && (
              <span className="text-xs text-muted-foreground">Not yet played: {SPORTS.filter((s) => !(s.id in d.me!.by_sport)).map((s) => s.name).join(", ")}</span>
            )}
          </div>
        )}
      </div>
      {q.isLoading ? (
        <div className="flex justify-center py-16" role="status"><Loader2 className="size-8 animate-spin text-primary" aria-label="Loading championship" /></div>
      ) : q.isError ? (
        <p role="alert" className="text-destructive">Couldn't load the championship. Check your connection.</p>
      ) : !d || d.rows.length === 0 ? (
        <EmptyState icon={<Sparkles />} title="No points yet this month" description="Finish an online match in any sport to open the standings." action={<GameButton asChild variant="hot"><Link to="/friends">Challenge a friend</Link></GameButton>} />
      ) : (
        <div className="glass overflow-hidden rounded-2xl">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Player</th><th className="px-3 py-2 text-right">Points</th><th className="hidden px-3 py-2 sm:table-cell">Sports</th></tr>
            </thead>
            <tbody>
              {d.rows.map((r) => (
                <tr key={r.player.id} className={cn("border-t border-white/5", r.player.id === me && "bg-primary/15")}>
                  <td className="px-3 py-2 font-display text-lg font-black">{MEDAL[r.rank] || r.rank}</td>
                  <td className="px-3 py-2"><Link to="/players/$username" params={{ username: r.player.username ?? "" }} className="font-semibold hover:underline">{flag(r.player.country)} {r.player.display_name}</Link></td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{r.points}</td>
                  <td className="hidden px-3 py-2 sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {SPORTS.map((s) => (
                        <span key={s.id} title={`${s.name}: ${r.by_sport[s.id] ?? 0} pts`} className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase", s.id in r.by_sport ? "bg-white/15" : "bg-white/5 text-white/30")}>
                          {s.name.slice(0, 3)} {r.by_sport[s.id] ?? ""}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Page() {
  const [scope, setScope] = useState<Scope | "allrounder">("overall");
  const [friends, setFriends] = useState(false);
  const { session } = useSession();
  const me = session?.user.id;
  const q = useLeaderboard(scope === "allrounder" ? "overall" : scope, friends && !!session);
  const data = q.data;
  return (
    <PageShell title="Rankings" description="Ratings from real, server-verified online matches. Nothing here is simulated.">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Sport" className="flex flex-wrap gap-1 rounded-2xl bg-secondary p-1">
          {SCOPES.map((s) => (
            <button key={s.id} role="tab" aria-selected={scope === s.id} onClick={() => setScope(s.id)}
              className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold", scope === s.id ? "bg-gradient-primary text-primary-foreground" : "hover:bg-muted")}>{s.label}</button>
          ))}
          <button role="tab" aria-selected={scope === "allrounder"} onClick={() => setScope("allrounder")}
            className={cn("inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-sm font-semibold", scope === "allrounder" ? "bg-gradient-gold text-black" : "hover:bg-muted")}><Sparkles className="size-3.5" aria-hidden />All-Rounder</button>
        </div>
        <div role="tablist" aria-label="Who" className="flex gap-1 rounded-2xl bg-secondary p-1">
          {[false, true].map((f) => (
            <button key={String(f)} role="tab" aria-selected={friends === f} disabled={f && !session} onClick={() => setFriends(f)}
              className={cn("rounded-xl px-3 py-1.5 text-sm font-semibold disabled:opacity-40", friends === f ? "bg-gradient-primary text-primary-foreground" : "hover:bg-muted")}>{f ? "Friends" : "Global"}</button>
          ))}
        </div>
      </div>
      {scope === "allrounder" ? <AllRounderBoard friends={friends && !!session} me={me} /> : <>
      {data?.me && (
        <div className="glass mb-4 flex items-center gap-4 rounded-2xl p-4">
          <span className="font-display text-4xl font-black">#{data.me.rank}</span>
          <div><p className="font-semibold">Your rank</p><p className="text-sm text-muted-foreground">{data.me.rating} rating · {data.me.games} rated matches</p></div>
          <DivisionBadge rating={data.me.rating} games={data.me.games} progress className="ml-auto" />
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
                  <td className="px-3 py-2 text-right font-bold tabular-nums"><div className="flex items-center justify-end gap-2"><DivisionBadge rating={r.rating} games={r.games} className="hidden sm:inline-flex" />{r.rating}</div></td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{r.games}</td>
                  <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{r.wins}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>}
    </PageShell>
  );
}
