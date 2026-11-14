import { createFileRoute, Link } from "@tanstack/react-router";
import { PersonalBest } from "@/components/game/PersonalBest";
import { ControlsGate } from "@/components/game/ControlsGuide";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { BowlingStage } from "@/components/bowling/BowlingStage";
import { Scoreboard } from "@/components/bowling/Scoreboard";
import { GameButton } from "@/components/game/GameButton";
import type { ThrowInput } from "@/game/bowling/constants";
import { countSpares, countStrikes, scoreGame } from "@/game/bowling/scoring";
import type { SimResult } from "@/game/bowling/sim";
import { usePlayer } from "@/lib/player";

export const Route = createFileRoute("/play/bowling")({
  head: () => ({
    meta: [
      { title: "Bowling practice — PLAYVERSE" },
      { name: "description", content: "Practice ten-pin bowling with real 3D physics." },
      { property: "og:title", content: "Bowling practice — PLAYVERSE" },
      { property: "og:description", content: "Practice ten-pin bowling with real 3D physics." },
    ],
  }),
  component: () => <ControlsGate sport="bowling"><BowlingPractice /></ControlsGate>,
});

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rapierPromise: Promise<any> | null = null;
function loadRapier() {
  rapierPromise ??= import("@dimforge/rapier3d-compat").then(async (m) => {
    const R = (m as { default?: unknown }).default ?? m;
    await (R as { init: () => Promise<void> }).init();
    return R;
  });
  return rapierPromise;
}

/** Solo practice: physics runs in your browser; nothing is saved or ranked. */
function BowlingPractice() {
  const player = usePlayer();
  const [rolls, setRolls] = useState<number[]>([]);
  const [rack, setRack] = useState<number[]>(ALL);
  const [banner, setBanner] = useState<string | null>(null);
  const pending = useRef<number[] | null>(null);
  const game = useMemo(() => scoreGame(rolls), [rolls]);

  const onThrow = useCallback(
    async (input: ThrowInput): Promise<SimResult> => {
      const [R, { simulateThrow }] = await Promise.all([loadRapier(), import("@/game/bowling/sim")]);
      const result = simulateThrow(R, input, rack);
      pending.current = result.standing;
      return result;
    },
    [rack],
  );

  const onThrowShown = useCallback(
    (result: SimResult) => {
      const knocked = result.knocked.length;
      const before = scoreGame(rolls);
      const next = [...rolls, knocked];
      const after = scoreGame(next);
      setRolls(next);
      const freshRack = after.pinsStanding === 10;
      setRack(freshRack ? ALL : (pending.current ?? ALL));
      const wasFresh = before.pinsStanding === 10;
      setBanner(
        knocked === 10 && wasFresh ? "STRIKE!" : !wasFresh && knocked === before.pinsStanding ? "SPARE!" : result.gutter && knocked === 0 ? "Gutter ball" : knocked === 0 ? "Miss" : `${knocked} pin${knocked === 1 ? "" : "s"}`,
      );
      setTimeout(() => setBanner(null), 1600);
    },
    [rolls],
  );

  const restart = () => {
    setRolls([]);
    setRack(ALL);
    setBanner(null);
  };

  return (
    <div className="fixed inset-0 bg-black">
      <BowlingStage rack={rack} canThrow={!game.complete} onThrow={onThrow} onThrowShown={onThrowShown} avatar={player.avatar} waitingLabel="Game over">
        <div className="flex items-start gap-2 px-2 pt-2">
          <Link to="/hub" className="pointer-events-auto glass flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Leave practice">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <Scoreboard rows={[{ name: player.name, rolls, active: !game.complete }]} />
            <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wider text-white/60">Practice · not ranked</p>
          </div>
        </div>
        {banner && (
          <div className="mt-[18vh] text-center font-display text-6xl font-black uppercase italic text-gradient-gold drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] animate-rise">
            {banner}
          </div>
        )}
        {game.complete && (
          <div className="pointer-events-auto mx-auto mt-[14vh] w-fit glass rounded-3xl p-6 text-center animate-rise">
            <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-accent">Final score</p>
            <p className="font-display text-7xl font-black text-gradient-gold">{game.total}</p>
            <p className="text-sm text-white/70">{countStrikes(rolls)} strikes · {countSpares(rolls)} spares</p>
            <PersonalBest id="bowling.score" value={game.total} label="Best game" />
            <div className="mt-4 flex justify-center gap-2">
              <GameButton variant="hot" onClick={restart}><RotateCcw aria-hidden /> Play again</GameButton>
              <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
            </div>
          </div>
        )}
      </BowlingStage>
    </div>
  );
}
