import { Link } from "@tanstack/react-router";
import { CheckCircle2, Gift, Loader2, PartyPopper } from "lucide-react";
import { useSession } from "@/lib/session";
import { useClaimEventTier, useWeeklyEvent } from "@/lib/social";
import { getSport } from "@/lib/sports";
import { cn } from "@/lib/utils";
import { GameButton } from "./GameButton";

/** Live weekly event: a featured sport with three reward tiers, same for everyone. */
export function WeeklyEventCard() {
  const { session } = useSession();
  const q = useWeeklyEvent();
  const claim = useClaimEventTier();
  if (!session) return null;
  if (q.isLoading) return <div className="glass flex h-28 items-center justify-center rounded-3xl"><Loader2 className="size-6 animate-spin text-muted-foreground" aria-label="Loading event" /></div>;
  if (!q.data) return null;
  const e = q.data;
  const sport = getSport(e.sport);
  const days = Math.max(0, Math.ceil((new Date(e.ends_at).getTime() - Date.now()) / 86_400_000));
  return (
    <section aria-labelledby="weekly-event" className="glass relative overflow-hidden rounded-3xl p-5 sm:p-6">
      {sport && <img src={sport.image} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-15" />}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-3">
          <PartyPopper className="size-9 shrink-0 text-gold" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-gold">Live event · {days} day{days === 1 ? "" : "s"} left</p>
            <h2 id="weekly-event" className="font-display text-2xl font-black uppercase leading-tight">{e.name}</h2>
          </div>
          <GameButton asChild variant="primary" size="sm"><Link to="/sports/$sport" params={{ sport: e.sport }}>Play {sport?.name ?? e.sport}</Link></GameButton>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-3">
          {e.tiers.map((t) => {
            const done = t.progress >= t.goal;
            return (
              <li key={t.tier} className={cn("rounded-2xl p-3", done ? "bg-gold/15" : "bg-white/5")}>
                <p className="text-sm font-semibold">{t.title}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-gold" style={{ width: `${(t.progress / t.goal) * 100}%` }} /></div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{t.progress}/{t.goal} · +{t.xp} XP</span>
                  {t.claimed ? <span className="inline-flex items-center gap-1 font-bold text-success"><CheckCircle2 className="size-3.5" aria-hidden /> Claimed</span>
                    : done ? <GameButton size="sm" variant="hot" disabled={claim.isPending} onClick={() => claim.mutate(t.tier)}><Gift aria-hidden /> Claim</GameButton> : null}
                </div>
              </li>
            );
          })}
        </ul>
        {claim.isError && <p role="alert" className="mt-2 text-sm text-destructive">{claim.error.message}</p>}
      </div>
    </section>
  );
}
