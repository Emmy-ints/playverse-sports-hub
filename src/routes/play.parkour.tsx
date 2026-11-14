import { createFileRoute, Link } from "@tanstack/react-router";
import { PersonalBest } from "@/components/game/PersonalBest";
import { formatRaceTime } from "@/components/parkour/ParkourStage";
import { ArrowLeft, Flag, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { ControlsGate } from "@/components/game/ControlsGuide";
import { GameButton } from "@/components/game/GameButton";
import { ParkourResults as Results, RUNNER_COLORS } from "@/components/parkour/ParkourResults";
import { ParkourStage } from "@/components/parkour/ParkourStage";
import { PracticeParkourDriver } from "@/game/parkour/driver";
import { CREW } from "@/game/parkour/roster";
import type { CourseLength } from "@/game/parkour/sim";
import { usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/parkour")({
  head: () => ({
    meta: [
      { title: "Rooftop Rush practice — PLAYVERSE" },
      { name: "description", content: "Parkour race across city rooftops: vault, slide, leap and climb against computer runners." },
      { property: "og:title", content: "Rooftop Rush practice — PLAYVERSE" },
      { property: "og:description", content: "Parkour race across city rooftops: vault, slide, leap and climb against computer runners." },
    ],
  }),
  component: ParkourPractice,
});

const LEVELS = [
  { id: "rookie", name: "Rookie", skills: [0.45, 0.3, 0.2] },
  { id: "pro", name: "Pro", skills: [0.75, 0.6, 0.45] },
  { id: "legend", name: "Legend", skills: [0.95, 0.85, 0.75] },
] as const;

interface Setup { length: CourseLength; rivals: number; level: (typeof LEVELS)[number]; key: number }

function ParkourPractice() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <SetupScreen onStart={setSetup} />;
  return (
    <ControlsGate key={setup.key} sport="parkour">
      <Run setup={setup} onRestart={() => setSetup({ ...setup, key: Date.now() })} onExit={() => setSetup(null)} />
    </ControlsGate>
  );
}

function Pick<T extends string | number>({ label, value, onChange, options }: { label: string; value: T; onChange: (v: T) => void; options: { id: T; name: string; hint?: string }[] }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">{label}</legend>
      <div className="grid grid-cols-3 gap-2">
        {options.map((o) => (
          <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
            className={cn("rounded-xl px-3 py-3 text-left font-semibold", value === o.id ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>
            {o.name}{o.hint && <span className="block text-xs font-normal opacity-80">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SetupScreen({ onStart }: { onStart: (s: Setup) => void }) {
  const [length, setLength] = useState<CourseLength>("standard");
  const [rivals, setRivals] = useState(3);
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("pro");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#5a2a4a,#0b1020)] p-4 pt-safe pb-safe">
      <div className="glass w-full max-w-xl rounded-3xl p-6">
        <Link to="/sports/$sport" params={{ sport: "parkour" }} className="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white"><ArrowLeft className="size-4" aria-hidden /> Parkour</Link>
        <h1 className="font-display text-4xl font-black uppercase">Rooftop Rush</h1>
        <p className="text-sm text-white/70">Vault, slide, leap and climb across the city at sunset. Practice — not ranked.</p>
        <Pick label="Course" value={length} onChange={setLength} options={[{ id: "sprint", name: "Sprint", hint: "≈ 25 s" }, { id: "standard", name: "Standard", hint: "≈ 40 s" }, { id: "marathon", name: "Marathon", hint: "≈ 60 s" }]} />
        <Pick label="Rivals" value={rivals} onChange={setRivals} options={[1, 2, 3].map((n) => ({ id: n, name: `${n} runner${n > 1 ? "s" : ""}` }))} />
        <Pick label="Rival level" value={level} onChange={setLevel} options={LEVELS.map((l) => ({ id: l.id, name: l.name }))} />
        <GameButton variant="hot" size="lg" className="mt-6 w-full" onClick={() => onStart({ length, rivals, level: LEVELS.find((l) => l.id === level)!, key: Date.now() })}>
          <Flag aria-hidden /> To the rooftops
        </GameButton>
      </div>
    </div>
  );
}

function Run({ setup, onRestart, onExit }: { setup: Setup; onRestart: () => void; onExit: () => void }) {
  const player = usePlayer();
  const driver = useMemo(() => new PracticeParkourDriver(setup.level.skills.slice(0, setup.rivals), setup.length), [setup]);
  const names = useMemo(() => [player.name, ...CREW.slice(0, setup.rivals).map((c) => c.name)], [player.name, setup.rivals]);
  const avatars = useMemo(() => [player.avatar ?? null, ...CREW.slice(0, setup.rivals).map((c) => c.avatar)], [player.avatar, setup.rivals]);
  const colors = useMemo(() => RUNNER_COLORS.slice(0, setup.rivals + 1), [setup.rivals]);
  return (
    <ParkourStage
      driver={driver}
      names={names}
      avatars={avatars}
      colors={colors}
      topRight={<button type="button" onClick={onExit} className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Leave</button>}
      renderEnd={(s) => <Results s={s} names={names} colors={colors} viewer={0} note={<PersonalBest id={`parkour.${setup.length}`} value={s.runners[0]!.finish} lowerIsBetter format={(v) => `${formatRaceTime(v)} s`} label="Best run" />} actions={
        <>
          <GameButton variant="hot" onClick={onRestart}><RotateCcw aria-hidden /> Run again</GameButton>
          <GameButton variant="glass" onClick={onExit}>Change setup</GameButton>
        </>
      } />}
    />
  );
}
