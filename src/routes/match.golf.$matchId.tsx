import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, RotateCcw, Trophy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GolfScorecard } from "@/components/golf/GolfScorecard";
import { GolfStage, type GolfReplay } from "@/components/golf/GolfStage";
import { GameButton } from "@/components/game/GameButton";
import { PresenceDot } from "@/components/game/PresenceDot";
import { RequireAccount } from "@/components/game/RequireAccount";
import { generateHole, THEMES } from "@/game/golf/course";
import { formatToPar, scoreName, toPar } from "@/game/golf/scoring";
import type { ShotInput, ShotResult } from "@/game/golf/sim";
import { fetchShot, submitShot, useGolfMatch } from "@/lib/golf-online";
import { setActivity } from "@/lib/presence";
import { useSession } from "@/lib/session";
import { useCreateInvitation } from "@/lib/social";

export const Route = createFileRoute("/match/golf/$matchId")({
  head: () => ({
    meta: [
      { title: "Golf match — PLAYVERSE" },
      { name: "description", content: "Live 1v1 golf match." },
      { property: "og:title", content: "Golf match — PLAYVERSE" },
      { property: "og:description", content: "Live 1v1 golf match." },
    ],
  }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  return (
    <div className="fixed inset-0 bg-black">
      <RequireAccount feature="Online matches">
        <OnlineGolf matchId={matchId} />
      </RequireAccount>
    </div>
  );
}

function OnlineGolf({ matchId }: { matchId: string }) {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const q = useGolfMatch(matchId);
  const data = q.data ?? null;
  const game = data?.game ?? null;
  const [replay, setReplay] = useState<(GolfReplay & { hole: number }) | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const seen = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    setActivity("in_match");
    return () => setActivity(null);
  }, []);

  // While an opponent's shot is replaying, keep showing the hole it was played on.
  const holeIdx = replay ? replay.hole : (game?.hole_index ?? 0);
  const seed = game?.course_seed ?? null;
  const holeCount = game?.hole_count ?? 0;
  const hole = useMemo(() => (seed !== null ? generateHole(holeIdx, seed) : null), [seed, holeIdx]);
  const pars = useMemo(() => (seed !== null ? Array.from({ length: holeCount }, (_, i) => generateHole(i, seed).par) : []), [seed, holeCount]);
  const names = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p.display_name])), [data?.players]);
  const myTurn = !!game && game.status === "playing" && game.current_player === me;
  const shown = game?.current_player ?? me ?? "";
  const ball = replay ? replay.from : (game?.balls[shown] ?? { x: 0, z: 0, lie: "tee" as const });
  const stableBall = useMemo(() => ball, [ball.x, ball.z, ball.lie]); // eslint-disable-line react-hooks/exhaustive-deps

  const flash = useCallback((text: string) => {
    setBanner(text);
    setTimeout(() => setBanner(null), 2000);
  }, []);

  const describe = useCallback((who: string | null, r: ShotResult, strokesBefore: number, par: number) => {
    const prefix = who ? `${who}: ` : "";
    if (r.outcome === "holed") return prefix + scoreName(strokesBefore + r.strokes, par);
    if (r.outcome === "water") return prefix + "Water · +1";
    if (r.outcome === "oob") return prefix + "Out of bounds · +1";
    if (r.end.lie === "green") return prefix + "On the green";
    if (r.end.lie === "bunker") return prefix + "In the bunker";
    return prefix + `${Math.round(r.total)} m`;
  }, []);

  useEffect(() => {
    if (!game) return;
    if (seen.current === undefined) {
      seen.current = game.last_shot_id;
      return;
    }
    const id = game.last_shot_id;
    if (id === null || id === seen.current) return;
    seen.current = id;
    void fetchShot(id).then((s) => {
      if (!s || s.player_id === me) return;
      setReplay({ id: String(id), result: s.result, input: s.input, from: s.from, hole: s.hole_index, avatar: data?.players.find((p) => p.id === s.player_id)?.avatar_config ?? null });
    });
  }, [game, me, data?.players]);

  const onShot = useCallback(async (input: ShotInput) => {
    if (!game) throw new Error("Game not loaded");
    return submitShot(matchId, game.turn_seq, input);
  }, [game, matchId]);

  const onShotShown = useCallback((r: ShotResult) => {
    if (!game || !me || !hole) return;
    flash(describe(null, r, game.hole_strokes[me] ?? 0, hole.par));
    void q.refetch();
  }, [game, me, hole, flash, describe, q]);

  if (q.isLoading) {
    return <div className="flex h-full items-center justify-center" role="status"><Loader2 className="size-10 animate-spin text-primary" aria-hidden /></div>;
  }
  if (q.isError || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p>{q.isError ? "Couldn't load this match. Check your connection." : "This match doesn't exist or you're not part of it."}</p>
        <GameButton asChild variant="hot"><Link to="/hub">Back to hub</Link></GameButton>
      </div>
    );
  }
  if (!game || !hole) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p>This round hasn't started yet. Both players need to be ready in the lobby.</p>
        <GameButton asChild variant="hot"><Link to="/lobby/$matchId" params={{ matchId }}>Go to lobby</Link></GameButton>
      </div>
    );
  }
  const theme = THEMES[game.theme];
  const opponent = data.players.find((p) => p.id !== me) ?? null;
  const rows = game.player_order.map((id) => ({ name: names.get(id) ?? "Player", card: game.card[id] ?? [], active: game.current_player === id }));
  const waitingFor = game.current_player ? names.get(game.current_player) : null;

  return (
    <GolfStage
      theme={theme}
      hole={hole}
      ball={stableBall}
      canShoot={myTurn && !replay}
      avatar={data.players.find((p) => p.id === shown)?.avatar_config ?? null}
      onShot={onShot}
      onShotShown={onShotShown}
      replay={replay}
      onReplayShown={() => {
        if (replay && opponent) {
          const before = (replay.hole === game.hole_index ? (game.hole_strokes[opponent.id] ?? 0) : (game.card[opponent.id]?.[replay.hole] ?? 0)) - replay.result.strokes;
          flash(describe(opponent.display_name, replay.result, Math.max(0, before), generateHole(replay.hole, game.course_seed).par));
        }
        setReplay(null);
        void q.refetch();
      }}
      waitingLabel={game.status === "completed" ? "Round complete" : waitingFor ? `${waitingFor} is playing…` : "Waiting…"}
    >
      <div className="flex items-start gap-2 px-2 pt-2">
        <Link to="/hub" className="pointer-events-auto glass flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Leave match view">
          <ArrowLeft className="size-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <GolfScorecard pars={pars} rows={rows} current={game.hole_index} />
          <p className="mt-1 flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-white/85 drop-shadow">
            {theme.name} · {game.scoring === "match_play" ? "Match play" : "Stroke play"} · server-verified
            {opponent && <PresenceDot userId={opponent.id} withLabel className="text-white/85" />}
          </p>
        </div>
      </div>
      {myTurn && !banner && !replay && (
        <p className="mx-auto mt-3 w-fit rounded-full bg-gradient-hot px-4 py-1 font-display text-lg font-black uppercase tracking-wider text-accent-foreground animate-rise">Your shot</p>
      )}
      {banner && <div className="mt-[16vh] px-4 text-center font-display text-5xl font-black uppercase italic text-gradient-gold drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] animate-rise">{banner}</div>}
      {game.status === "completed" && data.result && me && <Results data={data} me={me} pars={pars} />}
    </GolfStage>
  );
}

function Results({ data, me, pars }: { data: NonNullable<ReturnType<typeof useGolfMatch>["data"]>; me: string; pars: number[] }) {
  const navigate = useNavigate();
  const rematch = useCreateInvitation();
  const game = data.game!;
  const r = data.result!;
  const stats = r.stats as { rating_change?: Record<string, number>; xp?: Record<string, number>; holes_won?: Record<string, number> };
  const opp = data.players.find((p) => p.id !== me);
  const won = r.winner_id === me;
  return (
    <div className="pointer-events-auto mx-auto mt-[6vh] w-[min(92vw,34rem)] glass rounded-3xl p-6 text-center animate-rise">
      <Trophy className={won ? "mx-auto size-12 text-gold" : "mx-auto size-12 text-muted-foreground"} aria-hidden />
      <p className="font-display text-5xl font-black uppercase italic">{r.is_draw ? "All square!" : won ? "Victory!" : "Defeat"}</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {data.players.map((p) => {
          const card = game.card[p.id] ?? [];
          return (
            <div key={p.id} className={`rounded-2xl p-3 ${r.winner_id === p.id ? "bg-gold/15 ring-2 ring-gold/60" : "bg-secondary/60"}`}>
              <p className="truncate font-display text-lg font-bold uppercase">{p.display_name}</p>
              <p className="font-display text-5xl font-black tabular-nums">{r.scores[p.id] ?? "—"}</p>
              <p className="text-xs text-white/70">{formatToPar(toPar(card, pars))} to par{game.scoring === "match_play" ? ` · ${stats.holes_won?.[p.id] ?? 0} holes won` : ""}</p>
              <p className="mt-1 text-xs">Rating {(stats.rating_change?.[p.id] ?? 0) >= 0 ? "+" : ""}{stats.rating_change?.[p.id] ?? 0} · +{stats.xp?.[p.id] ?? 0} XP</p>
            </div>
          );
        })}
      </div>
      {rematch.isError && <p role="alert" className="mt-2 text-sm text-destructive">{rematch.error.message}</p>}
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {opp && (
          <GameButton variant="hot" disabled={rematch.isPending} onClick={() => rematch.mutate({ target: opp.id, sport: "golf", config: { mode: game.scoring === "match_play" ? "match_play" : "stroke", length: game.hole_count, public: false } }, { onSuccess: () => navigate({ to: "/invitations" }) })}>
            <RotateCcw aria-hidden /> {rematch.isPending ? "Sending…" : "Rematch"}
          </GameButton>
        )}
        <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
      </div>
    </div>
  );
}
