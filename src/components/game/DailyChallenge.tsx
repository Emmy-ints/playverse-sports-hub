import { Link } from "@tanstack/react-router";
import { CalendarCheck, Gift, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { useClaimDaily, useDailyChallenge } from "@/lib/social";
import { getSport } from "@/lib/sports";
import { GameButton } from "./GameButton";

/** Today's featured challenge (same for everyone, resets at 00:00 UTC). Progress comes from server-settled matches only. */
export function DailyChallengeCard() {
  const { session } = useSession();
  const q = useDailyChallenge();
  const claim = useClaimDaily();
  const [left, setLeft] = useState("");
  useEffect(() => {
    if (!q.data) return;
    const tick = () => {
      const ms = new Date(q.data.resets_at).getTime() - Date.now();
      const h = Math.max(0, Math.floor(ms / 3.6e6)), m = Math.max(0, Math.floor((ms % 3.6e6) / 6e4));
      setLeft(`${h}h ${m}m`);
    };
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [q.data]);
  if (!session) return null;
  if (q.isLoading) return <div className="glass flex h-28 items-center justify-center rounded-3xl"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading daily challenge" /></div>;
  if (!q.data) return null;
  const c = q.data;
  const sport = getSport(c.sport);
  return (
    <section aria-labelledby="daily" className="glass relative overflow-hidden rounded-3xl p-5 sm:p-6">
      {sport && <img src={sport.image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-20" />}
      <div className="relative flex flex-wrap items-center gap-4">
        <CalendarCheck className="size-10 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wider text-primary">Daily challenge · resets in {left}</p>
          <h2 id="daily" className="font-display text-2xl font-black uppercase leading-tight">{c.title}</h2>
          <p className="text-sm text-muted-foreground">Reward: +{c.reward_xp} XP · progress {c.progress}/{c.goal}</p>
          <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-primary" style={{ width: `${(c.progress / c.goal) * 100}%` }} /></div>
        </div>
        {c.claimed ? (
          <span className="rounded-full bg-success/20 px-4 py-2 text-sm font-bold text-success">Claimed ✓</span>
        ) : c.done ? (
          <GameButton variant="hot" disabled={claim.isPending} onClick={() => claim.mutate()}><Gift aria-hidden /> Claim {c.reward_xp} XP</GameButton>
        ) : (
          <GameButton asChild variant="primary"><Link to="/sports/$sport" params={{ sport: c.sport }}>Play {sport?.name ?? c.sport}</Link></GameButton>
        )}
      </div>
      {claim.isError && <p role="alert" className="relative mt-2 text-sm text-destructive">{claim.error instanceof Error ? claim.error.message : "Couldn't claim."}</p>}
    </section>
  );
}
