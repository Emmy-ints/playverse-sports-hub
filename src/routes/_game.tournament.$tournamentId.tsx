import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, Loader2, Play, Trophy } from "lucide-react";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";
import { flag, useJoinTournament, useLeaveTournament, useStartTournament, useTournament, type TournamentDetail } from "@/lib/competitive";
import { describeConfig } from "@/lib/match-config";
import { useSession } from "@/lib/session";
import { getSport } from "@/lib/sports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/tournament/$tournamentId")({
  head: () => ({ meta: [{ title: "Tournament — PLAYVERSE" }, { name: "description", content: "Tournament bracket." }, { property: "og:title", content: "Tournament — PLAYVERSE" }, { property: "og:description", content: "Tournament bracket." }] }),
  component: Page,
});

function Page() {
  const { tournamentId } = Route.useParams();
  return (
    <RequireAccount feature="Tournaments">
      <Detail id={tournamentId} />
    </RequireAccount>
  );
}

const ROUND_NAMES: Record<number, string[]> = { 4: ["Semi-finals", "Final"], 8: ["Quarter-finals", "Semi-finals", "Final"] };

function Detail({ id }: { id: string }) {
  const q = useTournament(id);
  const { session } = useSession();
  const me = session?.user.id;
  const join = useJoinTournament(), leave = useLeaveTournament(), start = useStartTournament();
  if (q.isLoading) return <div className="flex justify-center py-16" role="status"><Loader2 className="size-8 animate-spin text-primary" aria-label="Loading tournament" /></div>;
  const t = q.data;
  if (!t) return <PageShell title="Tournament not found"><p className="text-muted-foreground">This tournament doesn't exist or you don't have access.</p></PageShell>;
  const sport = getSport(t.sport);
  const joined = t.players.some((p) => p.id === me);
  const host = t.created_by === me;
  const err = join.error ?? leave.error ?? start.error;
  const champion = t.players.find((p) => p.final_position === 1);
  return (
    <PageShell eyebrow={`${sport?.name ?? t.sport} · ${describeConfig(t.sport, t.config)} · ${t.size} players`} title={t.name}
      actions={
        <div className="flex gap-2">
          {t.status === "registration" && !joined && t.can_join && <GameButton variant="hot" disabled={join.isPending} onClick={() => join.mutate(t.id)}>Join</GameButton>}
          {t.status === "registration" && host && <GameButton variant="hot" disabled={start.isPending || t.players.length < t.size} onClick={() => start.mutate(t.id)}><Play aria-hidden /> Start</GameButton>}
          {t.status === "registration" && joined && <GameButton variant="glass" disabled={leave.isPending} onClick={() => leave.mutate(t.id)}>{host ? "Cancel" : "Leave"}</GameButton>}
        </div>
      }>
      {err && <p role="alert" className="mb-4 text-sm text-destructive">{err.message}</p>}
      {champion && (
        <div className="glass mb-6 flex items-center gap-4 rounded-3xl p-5">
          <Crown className="size-10 text-[#ffd23f]" aria-hidden />
          <div><p className="text-sm uppercase tracking-wider text-muted-foreground">Champion</p><p className="font-display text-3xl font-black uppercase">{flag(champion.country)} {champion.display_name}</p></div>
        </div>
      )}
      {t.status === "registration" ? (
        <div className="glass rounded-3xl p-5">
          <p className="font-semibold">{t.players.length}/{t.size} players joined{host && t.players.length < t.size && " — your friends can join from their Tournaments page."}</p>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Array.from({ length: t.size }, (_, i) => t.players[i]).map((p, i) => (
              <li key={i} className={cn("rounded-xl px-4 py-3", p ? "bg-secondary" : "border border-dashed border-white/15 text-muted-foreground")}>{p ? `${flag(p.country)} ${p.display_name}` : "Open spot"}</li>
            ))}
          </ul>
        </div>
      ) : (
        <Bracket t={t} me={me} />
      )}
    </PageShell>
  );
}

function Bracket({ t, me }: { t: TournamentDetail; me: string | undefined }) {
  const rounds = t.size === 8 ? 3 : 2;
  const name = (id: string | undefined) => {
    const p = t.players.find((x) => x.id === id);
    return p ? `${flag(p.country)} ${p.display_name}` : "TBD";
  };
  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {Array.from({ length: rounds }, (_, r) => {
        const slots = t.size / 2 ** (r + 1);
        return (
          <div key={r} className="flex min-w-56 flex-1 flex-col justify-around gap-4">
            <p className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">{ROUND_NAMES[t.size]?.[r] ?? `Round ${r + 1}`}</p>
            {Array.from({ length: slots }, (_, s) => {
              const m = t.matches.find((x) => x.round === r + 1 && x.slot === s);
              const mine = !!m && !!me && m.players.includes(me);
              return (
                <div key={s} className={cn("glass rounded-2xl p-3", mine && "ring-2 ring-primary")}>
                  {[0, 1].map((k) => {
                    const pid = m?.players[k];
                    const won = m?.winner && m.winner === pid;
                    return (
                      <p key={k} className={cn("flex items-center justify-between gap-2 py-1 text-sm", m?.status === "completed" && !won && "text-muted-foreground line-through decoration-white/30")}>
                        <span className="truncate">{name(pid)}</span>
                        {won && <Trophy className="size-4 shrink-0 text-[#ffd23f]" aria-label="Winner" />}
                      </p>
                    );
                  })}
                  {m && mine && m.status !== "completed" && (
                    <GameButton asChild size="sm" variant="hot" className="mt-2 w-full"><Link to="/lobby/$matchId" params={{ matchId: m.id }}>{m.status === "lobby" ? "Play your match" : "Rejoin"}</Link></GameButton>
                  )}
                  {!m && <p className="text-xs text-muted-foreground">Waiting for earlier results</p>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
