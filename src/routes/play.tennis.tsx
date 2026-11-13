import { createFileRoute, Link } from "@tanstack/react-router";
import { ControlsGate } from "@/components/game/ControlsGuide";
import { ArrowLeft, RotateCcw, Trophy } from "lucide-react";
import { useMemo, useState } from "react";
import { GameButton } from "@/components/game/GameButton";
import { TennisStage } from "@/components/tennis/TennisStage";
import { PracticeDriver } from "@/game/tennis/driver";
import { COURT_THEMES, type CourtTheme } from "@/game/tennis/themes";
import type { AvatarConfig } from "@/lib/avatar";
import { usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/tennis")({
  head: () => ({
    meta: [
      { title: "Tennis practice — PLAYVERSE" },
      { name: "description", content: "Play a 3D tennis match against an AI opponent." },
      { property: "og:title", content: "Tennis practice — PLAYVERSE" },
      { property: "og:description", content: "Play a 3D tennis match against an AI opponent." },
    ],
  }),
  component: TennisPractice,
});

const LEVELS = [
  { id: "rookie", name: "Rookie", level: 0.45 },
  { id: "pro", name: "Pro", level: 0.62 },
  { id: "champion", name: "Champion", level: 0.8 },
] as const;

const AI_AVATAR: AvatarConfig = {
  version: 1, nickname: "Ace_Bot", genderPresentation: "neutral", skinTone: "#7a4b2e", face: "fierce", hairstyle: "buzz",
  hairColor: "#1b1410", outfit: "tennis", outfitColor: "#e8eaf0", shoes: "court", shoeColor: "#e8eaf0", accessory: "headband",
};

interface Setup { theme: CourtTheme; level: (typeof LEVELS)[number]; bestOf: 1 | 3; games: 4 | 6; key: number }

function TennisPractice() {
  const [setup, setSetup] = useState<Setup | null>(null);
  if (!setup) return <SetupScreen onStart={setSetup} />;
  return <ControlsGate key={setup.key} sport="tennis"><Match setup={setup} onRematch={() => setSetup({ ...setup, key: setup.key + 1 })} onExit={() => setSetup(null)} /></ControlsGate>;
}

function Choice<T extends string | number>({ label, options, value, onChange }: { label: string; options: { id: T; name: string; hint?: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button key={String(o.id)} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)}
            className={cn("rounded-xl px-4 py-3 text-left font-semibold", value === o.id ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>
            {o.name}
            {o.hint && <span className="block text-xs font-normal opacity-80">{o.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SetupScreen({ onStart }: { onStart: (s: Setup) => void }) {
  const [theme, setTheme] = useState<CourtTheme["id"]>("hard");
  const [level, setLevel] = useState<(typeof LEVELS)[number]["id"]>("pro");
  const [length, setLength] = useState<"quick" | "one" | "three">("quick");
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#1d3d6b,#0b1020)] p-4 pt-safe pb-safe">
      <div className="glass w-full max-w-xl rounded-3xl p-6">
        <Link to="/sports/$sport" params={{ sport: "tennis" }} className="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Tennis World
        </Link>
        <h1 className="font-display text-4xl font-black uppercase">Practice match</h1>
        <p className="text-sm text-white/70">Real ball physics, five venues, an AI opponent. Not ranked.</p>
        <Choice label="Venue" value={theme} onChange={setTheme} options={Object.values(COURT_THEMES).map((t) => ({ id: t.id, name: t.name, hint: t.blurb }))} />
        <Choice label="Opponent" value={level} onChange={setLevel} options={LEVELS.map((l) => ({ id: l.id, name: l.name }))} />
        <Choice label="Length" value={length} onChange={setLength} options={[
          { id: "quick", name: "Quick set", hint: "First to 4 games" },
          { id: "one", name: "Full set", hint: "First to 6 games, tiebreak at 6–6" },
          { id: "three", name: "Best of 3", hint: "Sets to 4 games" },
        ]} />
        <GameButton variant="hot" size="lg" className="mt-6 w-full" onClick={() => onStart({
          theme: COURT_THEMES[theme], level: LEVELS.find((l) => l.id === level)!, bestOf: length === "three" ? 3 : 1, games: length === "one" ? 6 : 4, key: Date.now(),
        })}>
          Walk on court
        </GameButton>
      </div>
    </div>
  );
}

function Match({ setup, onRematch, onExit }: { setup: Setup; onRematch: () => void; onExit: () => void }) {
  const player = usePlayer();
  const driver = useMemo(() => new PracticeDriver({ bestOf: setup.bestOf, gamesPerSet: setup.games }, setup.theme.surface, setup.level.level), [setup]);
  const names: [string, string] = [player.name, `${setup.level.name} Bot`];
  const avatars = useMemo<[AvatarConfig | null, AvatarConfig | null]>(() => [player.avatar, AI_AVATAR], [player.avatar]);
  return (
    <TennisStage
      theme={setup.theme}
      driver={driver}
      names={names}
      avatars={avatars}
      topRight={
        <button type="button" onClick={onExit} className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Leave</button>
      }
      renderEnd={({ winner, score, stats }) => (
        <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white animate-rise">
          <Trophy className={cn("mx-auto size-10", winner === 0 ? "text-[#ffd23f]" : "text-white/50")} aria-hidden />
          <h2 className="mt-2 font-display text-4xl font-black uppercase">{winner === 0 ? "You win!" : `${names[1]} wins`}</h2>
          <p className="mt-1 font-display text-2xl">{score.history.map((h) => `${h[0]}–${h[1]}`).join("  ")}</p>
          <table className="mx-auto mt-4 w-full text-sm">
            <thead><tr className="text-white/60"><th className="text-left font-normal">Stat</th><th>{names[0]}</th><th>{names[1]}</th></tr></thead>
            <tbody>
              {(["pointsWon", "aces", "winners", "errors", "doubleFaults"] as const).map((k) => (
                <tr key={k} className="border-t border-white/10">
                  <td className="py-1 text-left text-white/70">{{ pointsWon: "Points won", aces: "Aces", winners: "Winners", errors: "Errors", doubleFaults: "Double faults" }[k]}</td>
                  <td className="font-bold">{stats[0][k]}</td>
                  <td className="font-bold">{stats[1][k]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-5 flex justify-center gap-2">
            <GameButton variant="hot" onClick={onRematch}><RotateCcw aria-hidden /> Rematch</GameButton>
            <GameButton variant="glass" onClick={onExit}>Change setup</GameButton>
          </div>
        </div>
      )}
    />
  );
}
