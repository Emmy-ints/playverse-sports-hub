import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RotateCcw, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BowlingStage, type StageReplay } from "@/components/bowling/BowlingStage";
import { Scoreboard } from "@/components/bowling/Scoreboard";
import { GameButton } from "@/components/game/GameButton";
import { PresenceDot } from "@/components/game/PresenceDot";
import { RequireAccount } from "@/components/game/RequireAccount";
import type { ThrowInput } from "@/game/bowling/constants";
import { countSpares, countStrikes, scoreGame } from "@/game/bowling/scoring";
import type { SimResult } from "@/game/bowling/sim";
import { fetchThrow, submitThrow, useBowlingMatch } from "@/lib/bowling-online";
import { describeConfig } from "@/lib/match-config";
import { setActivity } from "@/lib/presence";
import { useSession } from "@/lib/session";
import { useCreateInvitation } from "@/lib/social";

export const Route = createFileRoute("/match/bowling/$matchId")({
  head: () => ({
    meta: [
      { title: "Bowling match — PLAYVERSE" },
      { name: "description", content: "Live 1v1 bowling match." },
      { property: "og:title", content: "Bowling match — PLAYVERSE" },
      { property: "og:description", content: "Live 1v1 bowling match." },
    ],
  }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  return (
    <div className="fixed inset-0 bg-black">
      <RequireAccount feature="Online matches">
        <OnlineBowling matchId={matchId} />
      </RequireAccount>
    </div>
  );
}

function OnlineBowling({ matchId }: { matchId: string }) {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const q = useBowlingMatch(matchId);
  const data = q.data ?? null;
  const game = data?.game ?? null;
  const [replay, setReplay] = useState<StageReplay | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const seen = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    setActivity("in_match");
    return () => setActivity(null);
  }, []);

  const names = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p.display_name])), [data?.players]);
  const opponent = data?.players.find((p) => p.id !== me) ?? null;
  const n = game?.frame_count ?? 10;
  const myTurn = !!game && game.status === "playing" && game.current_player === me;

  const showBanner = useCallback((who: string | null, rollsBefore: number[], knocked: number, gutter: boolean) => {
    const before = scoreGame(rollsBefore, n);
    const fresh = before.pinsStanding === 10;
    const text = knocked === 10 && fresh ? "STRIKE!" : !fresh && knocked === before.pinsStanding ? "SPARE!" : gutter && knocked === 0 ? "Gutter ball" : knocked === 0 ? "Miss" : `${knocked} pin${knocked === 1 ? "" : "s"}`;
    setBanner(who ? `${who}: ${text}` : text);
    setTimeout(() => setBanner(null), 1800);
  }, [n]);

  // Replay the opponent's throws as they arrive (skip whatever was already on the board when we loaded).
  useEffect(() => {
    if (!game) return;
    if (seen.current === undefined) {
      seen.current = game.last_throw_id;
      return;
    }
    const id = game.last_throw_id;
    if (id === null || id === seen.current) return;
    seen.current = id;
    void fetchThrow(id).then((t) => {
      if (!t || t.player_id === me) return;
      setReplay({ id: String(id), result: t.result });
    });
  }, [game, me]);

  const onThrow = useCallback(
    async (input: ThrowInput): Promise<SimResult> => {
      if (!game) throw new Error("Game not loaded");
      const result = await submitThrow(matchId, game.turn_seq, input);
      return result;
    },
    [game, matchId],
  );

  const onThrowShown = useCallback(
    (result: SimResult) => {
      if (!game || !me) return;
      showBanner(null, game.rolls[me] ?? [], result.knocked.length, result.gutter);
      void q.refetch();
    },
    [game, me, q, showBanner],
  );

  const onReplayShown = useCallback(() => {
    void q.refetch();
  }, [q]);

  if (q.isLoading) {
    return (
      <div className="flex h-full items-center justify-center" role="status">
        <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (q.isError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p>{q.isError ? "Couldn't load this match. Check your connection." : "This match doesn't exist or you're not part of it."}</p>
        <GameButton asChild variant="hot"><Link to="/hub">Back to hub</Link></GameButton>
      </div>
    );
  }
  if (!game) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p>This match hasn't started yet. Both players need to be ready in the lobby.</p>
        <GameButton asChild variant="hot"><Link to="/lobby/$matchId" params={{ matchId }}>Go to lobby</Link></GameButton>
      </div>
    );
  }

  const rows = game.player_order.map((id) => ({ name: names.get(id) ?? "Player", rolls: game.rolls[id] ?? [], active: game.current_player === id }));
  const waitingFor = game.current_player ? names.get(game.current_player) : null;

  return (
    <BowlingStage
      rack={game.standing}
      canThrow={myTurn}
      onThrow={onThrow}
      onThrowShown={onThrowShown}
      replay={replay}
      onReplayShown={(id) => {
        onReplayShown();
        const t = replay?.id === id ? replay.result : null;
        if (t && opponent) {
          const oppRolls = game.rolls[opponent.id] ?? [];
          // The board may already include this roll; banner uses the rolls before it.
          showBanner(opponent.display_name, oppRolls.slice(0, -1), t.knocked.length, t.gutter);
        }
      }}
      waitingLabel={game.status === "completed" ? "Match over" : waitingFor ? `${waitingFor} is bowling…` : "Waiting…"}
    >
      <div className="flex items-start gap-2 px-2 pt-2">
        <Link to="/hub" className="pointer-events-auto glass flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Leave match view">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <Scoreboard rows={rows} frameCount={n} compact />
          <p className="mt-1 flex items-center justify-center gap-2 text-center text-[11px] font-semibold uppercase tracking-wider text-white/70">
            Online · {describeConfig("bowling", data.config)} · server-verified
            {opponent && <PresenceDot userId={opponent.id} withLabel className="text-white/70" />}
          </p>
        </div>
      </div>
      {myTurn && !banner && (
        <p className="mx-auto mt-3 w-fit rounded-full bg-gradient-hot px-4 py-1 font-display text-lg font-black uppercase tracking-wider text-accent-foreground animate-rise">Your turn</p>
      )}
      {banner && (
        <div className="mt-[16vh] px-4 text-center font-display text-5xl font-black uppercase italic text-gradient-gold drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] animate-rise sm:text-6xl">
          {banner}
        </div>
      )}
      {game.status === "completed" && data.result && me && <Results data={data} me={me} matchId={matchId} />}
    </BowlingStage>
  );
}

function Results({ data, me, matchId }: { data: NonNullable<ReturnType<typeof useBowlingMatch>["data"]>; me: string; matchId: string }) {
  const navigate = useNavigate();
  const rematch = useCreateInvitation();
  const game = data.game!;
  const r = data.result!;
  const n = game.frame_count;
  const stats = r.stats as { rating_change?: Record<string, number>; xp?: Record<string, number> };
  const opp = data.players.find((p) => p.id !== me);
  const won = r.winner_id === me;
  const mins = Math.floor((r.duration_seconds ?? 0) / 60);
  const secs = (r.duration_seconds ?? 0) % 60;
  void matchId;

  return (
    <div className="pointer-events-auto mx-auto mt-[8vh] w-[min(92vw,34rem)] glass rounded-3xl p-6 text-center animate-rise">
      <Trophy className={won ? "mx-auto size-12 text-gold" : "mx-auto size-12 text-muted-foreground"} aria-hidden />
      <p className="font-display text-5xl font-black uppercase italic">{r.is_draw ? "Draw!" : won ? "Victory!" : "Defeat"}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {data.players.map((p) => {
          const rolls = game.rolls[p.id] ?? [];
          return (
            <div key={p.id} className={`rounded-2xl p-3 ${r.winner_id === p.id ? "bg-gold/15 ring-2 ring-gold/60" : "bg-secondary/60"}`}>
              <p className="truncate font-display text-lg font-bold uppercase">{p.display_name}</p>
              <p className="font-display text-5xl font-black tabular-nums">{scoreGame(rolls, n).total}</p>
              <p className="text-xs text-white/70">{countStrikes(rolls, n)} strikes · {countSpares(rolls, n)} spares</p>
              <p className="mt-1 text-xs">
                Rating {(stats.rating_change?.[p.id] ?? 0) >= 0 ? "+" : ""}{stats.rating_change?.[p.id] ?? 0} · +{stats.xp?.[p.id] ?? 0} XP
              </p>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-white/60">Match time {mins}:{String(secs).padStart(2, "0")} · results verified by the server</p>
      {rematch.isError && <p role="alert" className="mt-2 text-sm text-destructive">{rematch.error.message}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {opp && (
          <GameButton
            variant="hot"
            disabled={rematch.isPending}
            onClick={() =>
              rematch.mutate(
                { target: opp.id, sport: "bowling", config: { mode: data.config.mode ?? "frames", length: data.config.length ?? 10, public: false } },
                { onSuccess: () => navigate({ to: "/invitations" }) },
              )
            }
          >
            <RotateCcw aria-hidden /> {rematch.isPending ? "Sending…" : "Rematch"}
          </GameButton>
        )}
        <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
      </div>
    </div>
  );
}
