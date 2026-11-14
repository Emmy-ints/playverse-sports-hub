import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Lock, Medal } from "lucide-react";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { RequireAccount } from "@/components/game/RequireAccount";
import { useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { SPORTS, getSport, type SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/achievements")({
  head: () => ({ meta: [
    { title: "Achievements — PLAYVERSE" }, { name: "description", content: "Milestones, badges and personal records earned across PLAYVERSE." },
    { property: "og:title", content: "Achievements — PLAYVERSE" }, { property: "og:description", content: "Milestones, badges and personal records earned across PLAYVERSE." },
  ] }),
  component: Page,
});

interface Ach { id: string; name: string; description: string; sport: SportId | null; xp_reward: number }
interface Stat { sport: SportId; matches_played: number; wins: number; losses: number; draws: number; stats: Record<string, number> }

/** Friendly labels for the per-sport counters the server keeps in player_statistics.stats. */
const STAT_LABELS: Record<string, string> = {
  aces: "Aces", winners: "Winners", double_faults: "Double faults", strikes: "Strikes", spares: "Spares", best_score: "Best game",
  birdies: "Birdies", eagles: "Eagles", holes_in_one: "Holes in one", best_lap: "Best lap (s)", podiums: "Podiums", golds: "Gold medals",
  best_time: "Best time (s)", records: "Records",
};

function useAchievements(me: string | null) {
  return useQuery({
    queryKey: ["achievements-page", me],
    enabled: !!me,
    queryFn: async () => {
      const sb = getSupabase();
      if (!sb || !me) return null;
      const [a, mine, st] = await Promise.all([
        sb.from("achievements").select("id, name, description, sport, xp_reward").eq("is_active", true),
        sb.from("player_achievements").select("achievement_id, earned_at").eq("player_id", me),
        sb.from("player_statistics").select("sport, matches_played, wins, losses, draws, stats").eq("player_id", me),
      ]);
      if (a.error) throw a.error;
      const earned = new Map((mine.data ?? []).map((r) => [r.achievement_id as string, r.earned_at as string]));
      return { all: (a.data ?? []) as Ach[], earned, stats: (st.data ?? []) as Stat[] };
    },
  });
}

function Page() {
  return (
    <PageShell title="Achievements" description="Milestones, badges and personal records — every one verified from real online matches.">
      <RequireAccount feature="Achievements">
        <Body />
      </RequireAccount>
    </PageShell>
  );
}

function Body() {
  const { session } = useSession();
  const q = useAchievements(session?.user.id ?? null);
  if (q.isLoading) return <Loader2 className="mx-auto size-8 animate-spin text-muted-foreground" aria-label="Loading" />;
  if (q.isError || !q.data) return <p role="alert" className="text-destructive">Couldn't load achievements.</p>;
  const { all, earned, stats } = q.data;
  if (!all.length) return <EmptyState icon={<Medal />} title="No achievements yet" description="Play online matches to start earning badges." action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />;
  const groups: { key: string; title: string; items: Ach[] }[] = [
    { key: "general", title: "All sports", items: all.filter((x) => !x.sport) },
    ...SPORTS.map((s) => ({ key: s.id, title: s.name, items: all.filter((x) => x.sport === s.id) })),
  ].filter((g) => g.items.length);
  const got = all.filter((x) => earned.has(x.id)).length;
  const played = new Set(stats.filter((s) => s.matches_played > 0).map((s) => s.sport));
  return (
    <div className="space-y-8">
      <div className="glass flex flex-wrap items-center gap-4 rounded-2xl p-5">
        <Medal className="size-10 text-primary" aria-hidden />
        <div className="flex-1">
          <p className="font-display text-3xl font-black">{got} / {all.length}</p>
          <p className="text-sm text-muted-foreground">badges earned · {played.size}/6 arenas played online</p>
          <div className="mt-2 h-2 max-w-md overflow-hidden rounded-full bg-white/10"><div className="h-full bg-gradient-primary" style={{ width: `${(got / all.length) * 100}%` }} /></div>
        </div>
      </div>

      <section aria-labelledby="records">
        <h2 id="records" className="mb-3 font-display text-2xl font-black uppercase">Personal records</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SPORTS.map((s) => {
            const st = stats.find((x) => x.sport === s.id);
            const extra = Object.entries(st?.stats ?? {}).filter(([k, v]) => typeof v === "number" && STAT_LABELS[k]);
            return (
              <div key={s.id} className="glass rounded-2xl p-4">
                <p className="font-display text-lg font-black uppercase">{s.name}</p>
                {st && st.matches_played > 0 ? (
                  <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
                    <dt className="text-muted-foreground">Played</dt><dd className="text-right font-bold tabular-nums">{st.matches_played}</dd>
                    <dt className="text-muted-foreground">Won</dt><dd className="text-right font-bold tabular-nums">{st.wins} ({Math.round((st.wins / st.matches_played) * 100)}%)</dd>
                    {extra.flatMap(([k, v]) => [<dt key={`${k}-t`} className="text-muted-foreground">{STAT_LABELS[k]}</dt>, <dd key={`${k}-d`} className="text-right font-bold tabular-nums">{v}</dd>])}
                  </dl>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No online matches yet. <Link to="/sports/$sport" params={{ sport: s.id }} className="text-primary underline">Play</Link></p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`ach-${g.key}`}>
          <h2 id={`ach-${g.key}`} className="mb-3 font-display text-2xl font-black uppercase">{g.title}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {g.items.map((a) => {
              const when = earned.get(a.id);
              return (
                <li key={a.id} className={cn("glass flex items-start gap-3 rounded-2xl p-4", !when && "opacity-60")}>
                  {when ? <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-label="Earned" /> : <Lock className="mt-0.5 size-6 shrink-0 text-muted-foreground" aria-label="Locked" />}
                  <div className="min-w-0">
                    <p className="font-display text-lg font-bold leading-tight">{a.name} <span className="text-xs font-bold text-primary">+{a.xp_reward} XP</span></p>
                    <p className="text-sm text-muted-foreground">{a.description}</p>
                    {when && <p className="mt-0.5 text-xs text-success">Earned {new Date(when).toLocaleDateString()}{a.sport ? ` · ${getSport(a.sport)?.name ?? ""}` : ""}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
