import { createFileRoute, Link } from "@tanstack/react-router";
import { PersonalBest } from "@/components/game/PersonalBest";
import { ControlsGate } from "@/components/game/ControlsGuide";
import { ArrowLeft, Flag, RotateCcw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { GolfStage } from "@/components/golf/GolfStage";
import { GolfScorecard } from "@/components/golf/GolfScorecard";
import { GameButton } from "@/components/game/GameButton";
import { buildCourse, THEMES, type CourseTheme, type Surface } from "@/game/golf/course";
import { formatToPar, maxStrokes, scoreName, toPar } from "@/game/golf/scoring";
import { simulateShot, type ShotInput, type ShotResult } from "@/game/golf/sim";
import { usePlayer } from "@/lib/player";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/play/golf")({
  head: () => ({
    meta: [
      { title: "Golf practice — PLAYVERSE" },
      { name: "description", content: "Play a practice round of 3D golf." },
      { property: "og:title", content: "Golf practice — PLAYVERSE" },
      { property: "og:description", content: "Play a practice round of 3D golf." },
    ],
  }),
  component: GolfPractice,
});

function GolfPractice() {
  const [setup, setSetup] = useState<{ theme: CourseTheme; holes: number; seed: number } | null>(null);
  if (!setup) return <Setup onStart={setSetup} />;
  return <ControlsGate key={setup.seed} sport="golf"><Round theme={setup.theme} holeCount={setup.holes} seed={setup.seed} onRestart={() => setSetup(null)} /></ControlsGate>;
}

function Setup({ onStart }: { onStart: (s: { theme: CourseTheme; holes: number; seed: number }) => void }) {
  const [theme, setTheme] = useState<CourseTheme["id"]>("countryside");
  const [holes, setHoles] = useState(3);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#1b3a2a,#0b1020)] p-4 pt-safe pb-safe">
      <div className="glass w-full max-w-lg rounded-3xl p-6">
        <Link to="/sports/$sport" params={{ sport: "golf" }} className="mb-3 inline-flex items-center gap-1 text-sm text-white/70 hover:text-white">
          <ArrowLeft className="size-4" aria-hidden /> Golf World
        </Link>
        <h1 className="font-display text-4xl font-black uppercase">Practice round</h1>
        <p className="text-sm text-white/70">Real ball flight, wind and terrain. Not ranked.</p>
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Course</legend>
          <div className="grid gap-2">
            {Object.values(THEMES).map((t) => (
              <button key={t.id} type="button" aria-pressed={theme === t.id} onClick={() => setTheme(t.id)}
                className={cn("rounded-xl px-4 py-3 text-left font-semibold", theme === t.id ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>
                {t.name}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-white/70">Holes</legend>
          <div className="flex gap-2">
            {[3, 9, 18].map((n) => (
              <button key={n} type="button" aria-pressed={holes === n} onClick={() => setHoles(n)}
                className={cn("h-11 flex-1 rounded-xl font-display text-lg font-bold", holes === n ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>
                {n}
              </button>
            ))}
          </div>
        </fieldset>
        <GameButton variant="hot" size="lg" className="mt-6 w-full" onClick={() => onStart({ theme: THEMES[theme], holes, seed: Math.floor(Math.random() * 1_000_000) + 1 })}>
          <Flag aria-hidden /> Tee off
        </GameButton>
      </div>
    </div>
  );
}

function Round({ theme, holeCount, seed, onRestart }: { theme: CourseTheme; holeCount: number; seed: number; onRestart: () => void }) {
  const player = usePlayer();
  const course = useMemo(() => buildCourse(holeCount, seed), [holeCount, seed]);
  const [holeIdx, setHoleIdx] = useState(0);
  const [ball, setBall] = useState<{ x: number; z: number; lie: Surface }>({ x: 0, z: 0, lie: "tee" });
  const [strokes, setStrokes] = useState(0);
  const [card, setCard] = useState<(number | null)[]>(() => Array(holeCount).fill(null));
  const [banner, setBanner] = useState<string | null>(null);
  const hole = course[holeIdx]!;
  const done = card.every((c) => c !== null);
  const pars = course.map((h) => h.par);

  const flash = (text: string, ms = 1800) => {
    setBanner(text);
    setTimeout(() => setBanner(null), ms);
  };

  const onShot = useCallback(async (input: ShotInput): Promise<ShotResult> => simulateShot(hole, ball, input), [hole, ball]);

  const onShotShown = useCallback((r: ShotResult) => {
    const total = strokes + r.strokes;
    const finishHole = (score: number, text: string) => {
      setCard((c) => c.map((v, i) => (i === holeIdx ? score : v)));
      flash(text, 2200);
      setTimeout(() => {
        if (holeIdx + 1 < holeCount) {
          setHoleIdx(holeIdx + 1);
          setBall({ x: 0, z: 0, lie: "tee" });
          setStrokes(0);
        }
      }, 2300);
    };
    if (r.outcome === "holed") return finishHole(total, scoreName(total, hole.par));
    if (total >= maxStrokes(hole.par)) return finishHole(maxStrokes(hole.par), "Picked up");
    setStrokes(total);
    setBall(r.end);
    if (r.outcome === "water") flash("Water hazard · +1 penalty");
    else if (r.outcome === "oob") flash("Out of bounds · +1, replay");
    else if (r.end.lie === "green" && strokes === 0) flash("On the green!");
    else if (r.carry > 0 && input_isLong(r)) flash(`${Math.round(r.carry)} m carry`, 1200);
  }, [strokes, holeIdx, holeCount, hole.par]);

  return (
    <div className="fixed inset-0 bg-black">
      <GolfStage theme={theme} hole={hole} ball={ball} canShoot={!done} avatar={player.avatar} onShot={onShot} onShotShown={onShotShown} waitingLabel="Round complete">
        <div className="flex items-start gap-2 px-2 pt-2">
          <Link to="/sports/$sport" params={{ sport: "golf" }} className="pointer-events-auto glass flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Leave practice">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <GolfScorecard pars={pars} rows={[{ name: player.name, card, active: !done }]} current={holeIdx} />
            <p className="mt-1 text-center text-[11px] font-semibold uppercase tracking-wider text-white/80 drop-shadow">
              {theme.name} · Stroke {strokes + 1} · Practice
            </p>
          </div>
        </div>
        {banner && (
          <div className="mt-[16vh] px-4 text-center font-display text-5xl font-black uppercase italic text-gradient-gold drop-shadow-[0_4px_20px_rgba(0,0,0,0.8)] animate-rise sm:text-6xl">{banner}</div>
        )}
        {done && (
          <div className="pointer-events-auto mx-auto mt-[10vh] w-fit glass rounded-3xl p-6 text-center animate-rise">
            <p className="font-display text-sm font-bold uppercase tracking-[0.3em] text-accent">Round complete</p>
            <p className="font-display text-6xl font-black text-gradient-gold">{card.reduce<number>((s, v) => s + (v ?? 0), 0)}</p>
            <p className="text-white/80">{formatToPar(toPar(card, pars))} to par</p>
            <PersonalBest id={`golf.${theme.id}.${holeCount}`} value={toPar(card, pars)} lowerIsBetter format={formatToPar} label={`Best ${holeCount}-hole round`} />
            <div className="mt-4 flex justify-center gap-2">
              <GameButton variant="hot" onClick={onRestart}><RotateCcw aria-hidden /> New round</GameButton>
              <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
            </div>
          </div>
        )}
      </GolfStage>
    </div>
  );
}

function input_isLong(r: ShotResult) {
  return r.carry > 180;
}
