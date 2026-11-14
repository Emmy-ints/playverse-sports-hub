import { createFileRoute, Link } from "@tanstack/react-router";
import { ControlsGate } from "@/components/game/ControlsGuide";
import { ArrowLeft, Flag, RotateCcw, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { GameButton } from "@/components/game/GameButton";
import { formatTime, RaceStage } from "@/components/racing/RaceStage";
import { PracticeRaceDriver } from "@/game/racing/driver";
import { CAR_COLORS } from "@/game/racing/themes";
import { TRACKS, type TrackDef } from "@/game/racing/track";
import { usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/racing")({
  head: () => ({
    meta: [
      { title: "Racing practice — PLAYVERSE" },
      { name: "description", content: "Race 3D cars against AI drivers on three circuits." },
      { property: "og:title", content: "Racing practice — PLAYVERSE" },
      { property: "og:description", content: "Race 3D cars against AI drivers on three circuits." },
    ],
  }),
  component: RacingPractice,
});

const LEVELS = [
  { id: "rookie", name: "Rookie", level: 0.55 },
  { id: "pro", name: "Pro", level: 0.75 },
  { id: "champion", name: "Champion", level: 0.92 },
] as const;
const AI_NAMES = ["Vega", "Kato", "Rossi", "Okafor", "Lind", "Mendes", "Novak"];

interface Setup { track: TrackDef["id"]; laps: number; opponents: number; level: (typeof LEVELS)[number]; color: string; key: number }

function RacingPractice() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <SetupScreen onStart={setSetup} />;
  return <ControlsGate key={setup.key} sport="racing"><Race setup={setup} onRestart={() => setSetup({ ...setup, key: setup.key + 1 })} onExit={() => setSetup(null)} /></ControlsGate>;
}

function Pick<T extends string | number>({ label, value, onChange, options, cols = 3 }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; name: string; hint?: string }[]; cols?: number }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">{label}</legend>
      <div className={cn("grid gap-2", cols === 3 ? "sm:grid-cols-3" : "grid-cols-3")}>
        {options.map((o) => (
          <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
            className={cn("rounded-xl px-4 py-3 text-left font-semibold", value === o.id ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>
            {o.name}{o.hint && <span className="block text-xs font-normal opacity-80">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SetupScreen({ onStart }: { onStart: (s: Setup) => void }) {
  const [track, setTrack] = useState<TrackDef["id"]>("city");
  const [laps, setLaps] = useState(3);
  const [opponents, setOpponents] = useState(5);
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("pro");
  const [color, setColor] = useState<string>(CAR_COLORS[0]);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#3a1d4f,#0b1020)] p-4 pt-safe pb-safe">
      <div className="glass w-full max-w-xl rounded-3xl p-6">
        <Link to="/sports/$sport" params={{ sport: "racing" }} className="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white"><ArrowLeft className="size-4" aria-hidden /> Racing World</Link>
        <h1 className="font-display text-4xl font-black uppercase">Practice race</h1>
        <p className="text-sm text-white/70">Real car handling, three circuits, AI drivers. Not ranked.</p>
        <Pick label="Circuit" value={track} onChange={setTrack} options={Object.values(TRACKS).map((t) => ({ id: t.id, name: t.name, hint: t.blurb }))} />
        <Pick label="Laps" value={laps} onChange={setLaps} cols={1} options={[1, 3, 5].map((n) => ({ id: n, name: `${n} lap${n > 1 ? "s" : ""}` }))} />
        <Pick label="Opponents" value={opponents} onChange={setOpponents} cols={1} options={[1, 3, 5].map((n) => ({ id: n, name: `${n} AI` }))} />
        <Pick label="Difficulty" value={level} onChange={setLevel} cols={1} options={LEVELS.map((l) => ({ id: l.id, name: l.name }))} />
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Car colour</legend>
          <div className="flex flex-wrap gap-2">
            {CAR_COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("size-10 rounded-full border-2", color === c ? "border-white ring-2 ring-white/60" : "border-white/20")} style={{ background: c }} />)}
          </div>
        </fieldset>
        <GameButton variant="hot" size="lg" className="mt-6 w-full" onClick={() => onStart({ track, laps, opponents, level: LEVELS.find((l) => l.id === level)!, color, key: Date.now() })}>
          <Flag aria-hidden /> To the grid
        </GameButton>
      </div>
    </div>
  );
}

function Race({ setup, onRestart, onExit }: { setup: Setup; onRestart: () => void; onExit: () => void }) {
  const player = usePlayer();
  const driver = useMemo(() => new PracticeRaceDriver(setup.track, setup.opponents, setup.laps, setup.level.level), [setup]);
  const names = useMemo(() => [player.name, ...AI_NAMES.slice(0, setup.opponents)], [player.name, setup.opponents]);
  const colors = useMemo(() => [setup.color, ...CAR_COLORS.filter((c) => c !== setup.color).slice(0, setup.opponents)], [setup.color, setup.opponents]);
  const helmets = useMemo(() => [player.avatar?.outfitColor ?? "#ffffff", ...Array(setup.opponents).fill("#e8eaf0")], [player.avatar, setup.opponents]);
  return (
    <RaceStage
      track={setup.track}
      driver={driver}
      names={names}
      colors={colors}
      helmets={helmets}
      ghost
      topRight={<button type="button" onClick={onExit} className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Leave</button>}
      renderEnd={({ rows, final, viewer }) => {
        const mine = rows.findIndex((r) => r.car === viewer) + 1;
        return (
          <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white animate-rise">
            <Trophy className={cn("mx-auto size-10", mine === 1 ? "text-[#ffd23f]" : mine <= 3 ? "text-white" : "text-white/50")} aria-hidden />
            <h2 className="mt-2 font-display text-4xl font-black uppercase">{mine === 1 ? "Victory!" : `P${mine}`}</h2>
            {!final && <p className="text-sm text-white/70">Waiting for the others to finish…</p>}
            <ol className="mt-4 space-y-1 text-left text-sm">
              {rows.map((r, i) => (
                <li key={r.car} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", r.car === viewer ? "bg-white/15 font-bold" : "bg-white/5")}>
                  <span className="w-6 font-display">{i + 1}</span>
                  <span className="size-3 rounded-full" style={{ background: r.color }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="tabular-nums">{r.time !== null ? formatTime(r.time) : final ? "DNF" : "racing"}</span>
                  <span className="w-20 text-right text-xs tabular-nums text-white/60">{r.best ? formatTime(r.best) : ""}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5 flex justify-center gap-2">
              <GameButton variant="hot" onClick={onRestart}><RotateCcw aria-hidden /> Race again</GameButton>
              <GameButton variant="glass" onClick={onExit}>Change setup</GameButton>
            </div>
          </div>
        );
      }}
    />
  );
}
