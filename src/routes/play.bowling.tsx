import { createFileRoute, Link } from "@tanstack/react-router";
import { PersonalBest } from "@/components/game/PersonalBest";
import { ControlsGate } from "@/components/game/ControlsGuide";
import { ArrowLeft, Play, RotateCcw, Target } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { BowlingStage } from "@/components/bowling/BowlingStage";
import { Scoreboard } from "@/components/bowling/Scoreboard";
import { GameButton } from "@/components/game/GameButton";
import type { ThrowInput } from "@/game/bowling/constants";
import { countSpares, countStrikes, scoreGame } from "@/game/bowling/scoring";
import { VENUES, type VenueId } from "@/game/bowling/venues";
import { BALLS, OILS, type BallId, type OilId, type SimResult } from "@/game/bowling/sim";
import { cn } from "@/lib/utils";
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
  component: Page,
});

type Mode = "game" | "spares";
interface Setup { mode: Mode; ball: BallId; oil: OilId; venue: VenueId; key: number }

/** Classic spare leaves, easiest to hardest. */
const LEAVES: { pins: number[]; name: string }[] = [
  { pins: [10], name: "10 pin" }, { pins: [7], name: "7 pin" }, { pins: [3, 6, 10], name: "3-6-10" }, { pins: [2, 4, 5, 8], name: "Bucket" },
  { pins: [6, 10], name: "6-10" }, { pins: [4, 7], name: "4-7" }, { pins: [3, 10], name: "Baby split (3-10)" }, { pins: [5, 7], name: "5-7 split" },
  { pins: [6, 7, 10], name: "6-7-10" }, { pins: [7, 10], name: "7-10 split" },
];

function Page() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <SetupScreen onStart={setSetup} />;
  return (
    <ControlsGate key={setup.key} sport="bowling">
      {setup.mode === "game" ? <BowlingPractice setup={setup} onSetup={() => setSetup(null)} /> : <SpareChallenge setup={setup} onSetup={() => setSetup(null)} />}
    </ControlsGate>
  );
}

function SetupScreen({ onStart }: { onStart: (s: Setup) => void }) {
  const [mode, setMode] = useState<Mode>("game");
  const [ball, setBall] = useState<BallId>("reactive");
  const [oil, setOil] = useState<OilId>("house");
  const [venue, setVenue] = useState<VenueId>("neon");
  const opt = (on: boolean) => cn("rounded-xl px-3 py-2.5 text-left", on ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#2a1b3a,#0b1020)] p-4 pt-safe pb-safe">
      <div className="glass w-full max-w-lg rounded-3xl p-6">
        <Link to="/sports/$sport" params={{ sport: "bowling" }} className="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white"><ArrowLeft className="size-4" aria-hidden /> Bowling</Link>
        <h1 className="font-display text-4xl font-black uppercase">Practice lane</h1>
        <p className="text-sm text-white/70">Real rigid-body physics in your browser. Not ranked.</p>
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Mode</legend>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" aria-pressed={mode === "game"} onClick={() => setMode("game")} className={opt(mode === "game")}><span className="font-semibold">Full game</span><span className="block text-xs opacity-75">10 frames, real scoring</span></button>
            <button type="button" aria-pressed={mode === "spares"} onClick={() => setMode("spares")} className={opt(mode === "spares")}><span className="font-semibold">Spare challenge</span><span className="block text-xs opacity-75">10 classic leaves, one ball each</span></button>
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Ball</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(BALLS) as BallId[]).map((b) => (
              <button key={b} type="button" aria-pressed={ball === b} onClick={() => setBall(b)} className={opt(ball === b)}><span className="font-semibold">{BALLS[b].name}</span><span className="block text-xs opacity-75">{BALLS[b].note}</span></button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Oil pattern</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(OILS) as OilId[]).map((o) => (
              <button key={o} type="button" aria-pressed={oil === o} onClick={() => setOil(o)} className={opt(oil === o)}><span className="font-semibold">{OILS[o].name}</span><span className="block text-xs opacity-75">{OILS[o].note}</span></button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Venue</legend>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(VENUES) as VenueId[]).map((v) => (
              <button key={v} type="button" aria-pressed={venue === v} onClick={() => setVenue(v)} className={opt(venue === v)}>
                <span className="flex items-center gap-2 font-semibold"><span className="size-3 rounded-full" style={{ background: VENUES[v].a }} /><span className="size-3 rounded-full" style={{ background: VENUES[v].b }} />{VENUES[v].name}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <GameButton variant="hot" size="lg" className="mt-6 w-full" onClick={() => onStart({ mode, ball, oil, venue, key: Date.now() })}><Play aria-hidden /> Start bowling</GameButton>
      </div>
    </div>
  );
}

function setupLabel(s: Setup) {
  return `${BALLS[s.ball].name} · ${OILS[s.oil].name}`;
}

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
function BowlingPractice({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const player = usePlayer();
  const [rolls, setRolls] = useState<number[]>([]);
  const [rack, setRack] = useState<number[]>(ALL);
  const [banner, setBanner] = useState<string | null>(null);
  const pending = useRef<number[] | null>(null);
  const game = useMemo(() => scoreGame(rolls), [rolls]);

  const onThrow = useCallback(
    async (input: ThrowInput): Promise<SimResult> => {
      const [R, { simulateThrow }] = await Promise.all([loadRapier(), import("@/game/bowling/sim")]);
      const result = simulateThrow(R, input, rack, { ball: setup.ball, oil: setup.oil });
      pending.current = result.standing;
      return result;
    },
    [rack, setup.ball, setup.oil],
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
      <BowlingStage venue={setup.venue} rack={rack} canThrow={!game.complete} onThrow={onThrow} onThrowShown={onThrowShown} avatar={player.avatar} waitingLabel="Game over">
        <div className="flex items-start gap-2 px-2 pt-2">
          <Link to="/hub" className="pointer-events-auto glass flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Leave practice">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <Scoreboard rows={[{ name: player.name, rolls, active: !game.complete }]} />
            <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wider text-white/60">Practice · {setupLabel(setup)} · not ranked</p>
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
              <GameButton variant="glass" onClick={onSetup}>Change setup</GameButton>
              <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
            </div>
          </div>
        )}
      </BowlingStage>
    </div>
  );
}

/** Spare challenge: each classic leave once; one ball to convert it. */
function SpareChallenge({ setup, onSetup }: { setup: Setup; onSetup: () => void }) {
  const player = usePlayer();
  const [idx, setIdx] = useState(0);
  const [made, setMade] = useState<boolean[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const done = idx >= LEAVES.length;
  const leave = LEAVES[Math.min(idx, LEAVES.length - 1)]!;

  const onThrow = useCallback(
    async (input: ThrowInput): Promise<SimResult> => {
      const [R, { simulateThrow }] = await Promise.all([loadRapier(), import("@/game/bowling/sim")]);
      return simulateThrow(R, input, leave.pins, { ball: setup.ball, oil: setup.oil });
    },
    [leave, setup.ball, setup.oil],
  );
  const onThrowShown = useCallback((r: SimResult) => {
    const ok = r.standing.length === 0;
    setMade((m) => [...m, ok]);
    setBanner(ok ? "CONVERTED!" : r.knocked.length ? `${r.standing.length} left` : "Missed");
    setTimeout(() => {
      setBanner(null);
      setIdx((i) => i + 1);
    }, 1400);
  }, []);
  const score = made.filter(Boolean).length;
  const restart = () => {
    setIdx(0);
    setMade([]);
    setBanner(null);
  };

  return (
    <div className="fixed inset-0 bg-black">
      <BowlingStage venue={setup.venue} rack={done ? [] : leave.pins} canThrow={!done && made.length === idx} onThrow={onThrow} onThrowShown={onThrowShown} avatar={player.avatar} waitingLabel={done ? "Challenge over" : "Resetting pins…"}>
        <div className="flex items-start gap-2 px-2 pt-2">
          <Link to="/hub" className="pointer-events-auto glass flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Leave practice"><ArrowLeft className="size-5" aria-hidden /></Link>
          <div className="glass min-w-0 flex-1 rounded-2xl px-3 py-2 text-white">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 font-display text-lg font-black uppercase"><Target className="size-4 text-accent" aria-hidden />{done ? "Spare challenge" : `Leave ${idx + 1}/${LEAVES.length}: ${leave.name}`}</p>
              <span className="font-display text-xl font-black tabular-nums">{score}/{LEAVES.length}</span>
            </div>
            <div className="mt-1 flex gap-1" aria-label="Results so far">
              {LEAVES.map((l, i) => <span key={l.name} title={l.name} className={cn("h-1.5 flex-1 rounded-full", i < made.length ? (made[i] ? "bg-[#7cff6b]" : "bg-[#ff4d6d]") : i === idx ? "bg-white/60" : "bg-white/15")} />)}
            </div>
            <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wider text-white/60">{setupLabel(setup)} · not ranked</p>
          </div>
        </div>
        {banner && <div className="mt-[18vh] text-center font-display text-6xl font-black uppercase italic text-gradient-gold drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] animate-rise">{banner}</div>}
        {done && (
          <div className="pointer-events-auto mx-auto mt-[14vh] w-fit glass rounded-3xl p-6 text-center animate-rise">
            <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-accent">Spares converted</p>
            <p className="font-display text-7xl font-black text-gradient-gold">{score}/{LEAVES.length}</p>
            <PersonalBest id="bowling.spares" value={score} label="Best challenge" />
            <div className="mt-4 flex justify-center gap-2">
              <GameButton variant="hot" onClick={restart}><RotateCcw aria-hidden /> Try again</GameButton>
              <GameButton variant="glass" onClick={onSetup}>Change setup</GameButton>
            </div>
          </div>
        )}
      </BowlingStage>
    </div>
  );
}
