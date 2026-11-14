import { createFileRoute, Link } from "@tanstack/react-router";
import { PersonalBest } from "@/components/game/PersonalBest";
import { ControlsGate } from "@/components/game/ControlsGuide";
import { ArrowLeft, Medal, Play, RotateCcw, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { GameButton } from "@/components/game/GameButton";
import { AthleticsStage, markText } from "@/components/athletics/AthleticsStage";
import { PracticeAthleticsDriver } from "@/game/athletics/driver";
import { EVENT_ORDER, EVENTS, PLACE_POINTS, placings, type EventId, type EventState } from "@/game/athletics/sim";
import { ROSTER } from "@/game/athletics/roster";
import { usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/athletics")({
  head: () => ({
    meta: [
      { title: "Athletics — PLAYVERSE" },
      { name: "description", content: "Sprint, hurdles, long jump and javelin in a packed 3D stadium." },
      { property: "og:title", content: "Athletics — PLAYVERSE" },
      { property: "og:description", content: "Sprint, hurdles, long jump and javelin in a packed 3D stadium." },
    ],
  }),
  component: AthleticsPractice,
});

const LEVELS = [
  { id: "amateur", name: "Amateur", skill: 0.45 },
  { id: "pro", name: "Pro", skill: 0.68 },
  { id: "elite", name: "Elite", skill: 0.88 },
] as const;

interface Setup { events: EventId[]; rivals: number; level: (typeof LEVELS)[number]; key: number }

function AthleticsPractice() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <SetupScreen onStart={setSetup} />;
  return <ControlsGate key={setup.key} sport="athletics" events={setup.events}><Championship setup={setup} onExit={() => setSetup(null)} onRestart={() => setSetup({ ...setup, key: Date.now() })} /></ControlsGate>;
}

function SetupScreen({ onStart }: { onStart: (s: Setup) => void }) {
  const [mode, setMode] = useState<"champ" | EventId>("champ");
  const [rivals, setRivals] = useState(5);
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("pro");
  const btn = (on: boolean) => cn("rounded-xl px-4 py-3 text-left font-semibold", on ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#5a1d14,#0b1020)] p-4 pt-safe pb-safe">
      <div className="glass w-full max-w-xl rounded-3xl p-6">
        <Link to="/sports" className="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white"><ArrowLeft className="size-4" aria-hidden /> Sports</Link>
        <h1 className="font-display text-4xl font-black uppercase">Athletics</h1>
        <p className="text-sm text-white/70">Tap the lit arrows in rhythm to run. Jump, leap and throw with perfect timing. Not ranked.</p>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Competition</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" aria-pressed={mode === "champ"} onClick={() => setMode("champ")} className={cn(btn(mode === "champ"), "sm:col-span-2")}>
              Championship <span className="block text-xs font-normal opacity-80">All four events · points for every placing</span>
            </button>
            {EVENT_ORDER.map((e) => <button key={e} type="button" aria-pressed={mode === e} onClick={() => setMode(e)} className={btn(mode === e)}>{EVENTS[e].name}</button>)}
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Rivals</legend>
          <div className="grid grid-cols-3 gap-2">{[3, 5, 7].map((n) => <button key={n} type="button" aria-pressed={rivals === n} onClick={() => setRivals(n)} className={btn(rivals === n)}>{n}</button>)}</div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Level</legend>
          <div className="grid grid-cols-3 gap-2">{LEVELS.map((l) => <button key={l.id} type="button" aria-pressed={level === l.id} onClick={() => setLevel(l.id)} className={btn(level === l.id)}>{l.name}</button>)}</div>
        </fieldset>
        <GameButton variant="hot" size="lg" className="mt-6 w-full" onClick={() => onStart({ events: mode === "champ" ? EVENT_ORDER : [mode], rivals, level: LEVELS.find((l) => l.id === level)!, key: Date.now() })}>
          <Play aria-hidden /> Enter the stadium
        </GameButton>
      </div>
    </div>
  );
}

function Championship({ setup, onExit, onRestart }: { setup: Setup; onExit: () => void; onRestart: () => void }) {
  const player = usePlayer();
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<{ event: EventId; order: number[]; marks: (number | null)[] }[]>([]);
  const [between, setBetween] = useState(false);
  const event = setup.events[idx]!;
  const names = useMemo(() => [player.name, ...ROSTER.slice(0, setup.rivals).map((r) => r.name)], [player.name, setup.rivals]);
  const avatars = useMemo(() => [player.avatar, ...ROSTER.slice(0, setup.rivals).map((r) => r.avatar)], [player.avatar, setup.rivals]);
  const skills = useMemo(() => Array.from({ length: setup.rivals }, (_, i) => Math.max(0.2, Math.min(0.98, setup.level.skill + 0.12 - (i / Math.max(1, setup.rivals - 1)) * 0.3))), [setup]);
  const driver = useMemo(() => new PracticeAthleticsDriver(event, skills), [event, skills, idx]); // eslint-disable-line react-hooks/exhaustive-deps

  const points = names.map((_, i) => results.reduce((sum, r) => sum + (PLACE_POINTS[r.order.indexOf(i)] ?? 0), 0));
  const table = names.map((n, i) => ({ i, n, pts: points[i]! })).sort((a, b) => b.pts - a.pts);
  const last = results[results.length - 1];
  const done = results.length === setup.events.length;

  const onEnd = (s: EventState) => {
    setResults((r) => [...r, { event: s.event, order: placings(s), marks: s.athletes.map((a) => a.finish) }]);
    setBetween(true);
  };

  const overlay = between && last ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
      <div className="glass max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl p-6 text-white animate-rise">
        <p className="text-xs font-bold uppercase tracking-wider text-white/60">{EVENTS[last.event].name} · result</p>
        <ol className="mt-2 space-y-1">
          {last.order.map((i, k) => (
            <li key={i} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", i === 0 ? "bg-white/15 font-bold" : "bg-white/5")}>
              <span className="w-6 font-display">{k < 3 ? ["🥇", "🥈", "🥉"][k] : k + 1}</span>
              <span className="flex-1 truncate">{names[i]}</span>
              <span className="tabular-nums">{markText(last.event, last.marks[i] ?? null)}</span>
              <span className="w-10 text-right text-xs text-white/60">+{PLACE_POINTS[k] ?? 0}</span>
            </li>
          ))}
        </ol>
        {setup.events.length > 1 && (
          <>
            <p className="mt-4 text-xs font-bold uppercase tracking-wider text-white/60">{done ? "Final standings" : "Championship standings"}</p>
            <ol className="mt-2 space-y-1">
              {table.map((r, k) => (
                <li key={r.i} className={cn("flex justify-between rounded-lg px-3 py-1", r.i === 0 && "bg-[#ff7a1a]/25 font-bold")}>
                  <span>{k + 1}. {r.n}</span><span className="tabular-nums">{r.pts} pts</span>
                </li>
              ))}
            </ol>
          </>
        )}
        <PersonalBest key={results.length} id={`athletics.${last.event}`} value={last.marks[0] ?? null} lowerIsBetter={EVENTS[last.event].kind === "race"} format={(v) => markText(last.event, v)} />
        {done && (
          <p className="mt-4 flex items-center gap-2 font-display text-2xl font-black uppercase">
            {table[0]!.i === 0 ? <><Trophy className="text-[#ffd23f]" aria-hidden /> Champion!</> : <><Medal aria-hidden /> {table.findIndex((r) => r.i === 0) + 1}{["st", "nd", "rd"][table.findIndex((r) => r.i === 0)] ?? "th"} overall</>}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-2">
          {!done ? (
            <GameButton variant="hot" onClick={() => { setBetween(false); setIdx((v) => v + 1); }}><Play aria-hidden /> Next: {EVENTS[setup.events[idx + 1]!].name}</GameButton>
          ) : (
            <GameButton variant="hot" onClick={onRestart}><RotateCcw aria-hidden /> Compete again</GameButton>
          )}
          <GameButton variant="glass" onClick={onExit}>Change setup</GameButton>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <AthleticsStage
      event={event}
      driver={driver}
      names={names}
      avatars={avatars}
      onEventEnd={onEnd}
      overlay={overlay}
      topRight={<button type="button" onClick={onExit} className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Leave</button>}
    />
  );
}
