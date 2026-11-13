import { ChevronLeft, ChevronRight, Loader2, Monitor, Smartphone, Wind } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { distanceToCup, type CourseTheme, type Hole, type Surface } from "@/game/golf/course";
import type { GolfView, Quality } from "@/game/golf/renderer";
import { CLUBS, getClub, simulateShot, suggestClub, type ClubId, type ShotInput, type ShotResult } from "@/game/golf/sim";
import type { AvatarConfig } from "@/lib/avatar";
import { cn } from "@/lib/utils";

export interface GolfReplay { id: string; result: ShotResult; input: ShotInput; from: { x: number; z: number; lie: Surface }; avatar?: AvatarConfig | null }

interface Props {
  theme: CourseTheme;
  hole: Hole;
  ball: { x: number; z: number; lie: Surface };
  canShoot: boolean;
  avatar?: AvatarConfig | null;
  onShot: (input: ShotInput) => Promise<ShotResult>;
  onShotShown?: (result: ShotResult, input: ShotInput) => void;
  replay?: GolfReplay | null;
  onReplayShown?: (id: string) => void;
  waitingLabel?: string;
  children?: ReactNode;
}

type Phase = "loading" | "error" | "ready" | "power" | "accuracy" | "playing";

const LIE_LABEL: Record<Surface, string> = { tee: "Tee", fairway: "Fairway", rough: "Rough", green: "Green", fringe: "Fringe", bunker: "Bunker", water: "Water", oob: "Out of bounds" };

/** Default aim: at the flag if reachable-ish, else along the fairway. */
function defaultAim(hole: Hole, ball: { x: number; z: number }) {
  const toCup = Math.atan2(hole.cup.x - ball.x, -(hole.cup.z - ball.z));
  const d = distanceToCup(hole, ball.x, ball.z);
  if (d < 260) return toCup;
  // Aim at the dogleg bend if it's still ahead.
  const bend = hole.path[2]!;
  if (bend[1] < ball.z - 30) return Math.atan2(bend[0] - ball.x, -(bend[1] - ball.z));
  return toCup;
}

export function GolfStage({ theme, hole, ball, canShoot, avatar, onShot, onShotShown, replay, onReplayShown, waitingLabel, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<GolfView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [quality, setQuality] = useState<Quality>("high");
  const [aim, setAim] = useState(() => defaultAim(hole, ball));
  const dist = distanceToCup(hole, ball.x, ball.z);
  const [club, setClub] = useState<ClubId>(() => suggestClub(dist, ball.lie));
  const [power, setPower] = useState(0);
  const [needle, setNeedle] = useState(0);
  const lastPower = useRef(0.75);
  const meterStart = useRef<number | null>(null);
  const lockedPower = useRef(0);
  const busy = useRef(false);
  const loadedHole = useRef<number | null>(null);
  const played = useRef(new Set<string>());
  const drag = useRef<{ x: number; aim: number } | null>(null);

  // Boot.
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { createGolfView, detectQuality } = await import("@/game/golf/renderer");
        const q = detectQuality();
        if (!canvasRef.current || disposed) return;
        const view = await createGolfView(canvasRef.current, theme, q);
        if (disposed) return view.destroy();
        viewRef.current = view;
        setQuality(q);
        setPhase("ready");
      } catch (e) {
        console.error("[golf] failed to start 3D view", e);
        setError("Your browser couldn't start the 3D view. Try updating your browser or enabling hardware acceleration.");
        setPhase("error");
      }
    })();
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [theme]);

  // New hole or new ball position: reset aim and club.
  useEffect(() => {
    setAim(defaultAim(hole, ball));
    setClub(suggestClub(distanceToCup(hole, ball.x, ball.z), ball.lie));
    lastPower.current = ball.lie === "green" ? 0.3 : 0.75;
  }, [hole, ball]);

  // Live preview of where the shot goes (accuracy 0) at the current / last power.
  const previewPower = phase === "power" ? power : lastPower.current;
  const preview = useMemo(() => {
    if (!canShoot) return null;
    try {
      const r = simulateShot(hole, ball, { club, aim, power: Math.max(0.02, previewPower), accuracy: 0 });
      return r.frames.filter((_, i) => i % 2 === 0);
    } catch {
      return null;
    }
  }, [hole, ball, club, aim, previewPower, canShoot]);

  useEffect(() => {
    const v = viewRef.current;
    if (!v || phase === "loading" || phase === "playing") return;
    if (loadedHole.current !== hole.index) {
      v.loadHole(hole);
      loadedHole.current = hole.index;
    }
    v.setGolfer(avatar ?? null);
    v.setAddress(ball, aim, club, preview);
  }, [phase, hole, ball, aim, club, preview, avatar]);

  const play = useCallback(async (result: ShotResult, input: ShotInput, who: AvatarConfig | null | undefined, from: { x: number; z: number }) => {
    const v = viewRef.current;
    if (!v) return;
    setPhase("playing");
    if (loadedHole.current !== hole.index) {
      v.loadHole(hole);
      loadedHole.current = hole.index;
    }
    v.setGolfer(who ?? null);
    v.setAddress(from, input.aim, input.club, null);
    await v.playShot(result, { power: input.power, happy: result.outcome === "holed" || (result.outcome === "rest" && (result.end.lie === "green" || result.end.lie === "fairway")) });
  }, [hole]);

  const shoot = useCallback(async (input: ShotInput) => {
    if (busy.current || !canShoot) return;
    busy.current = true;
    setError(null);
    try {
      const from = { x: ball.x, z: ball.z };
      const result = await onShot(input);
      await play(result, input, avatar, from);
      onShotShown?.(result, input);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That shot couldn't be processed.");
    } finally {
      busy.current = false;
      setPhase("ready");
      setPower(0);
    }
  }, [avatar, ball, canShoot, onShot, onShotShown, play]);

  // Opponent replays.
  useEffect(() => {
    if (!replay || phase !== "ready" || played.current.has(replay.id)) return;
    played.current.add(replay.id);
    void (async () => {
      await play(replay.result, replay.input, replay.avatar, replay.from);
      setPhase("ready");
      onReplayShown?.(replay.id);
    })();
  }, [replay, phase, play, onReplayShown]);

  // Swing meter: hold to build power, release, then tap as the needle returns through the sweet spot.
  useEffect(() => {
    if (phase !== "power" && phase !== "accuracy") return undefined;
    let raf = 0;
    const tick = () => {
      const now = performance.now();
      if (phase === "power" && meterStart.current !== null) {
        setPower(Math.min(1, (now - meterStart.current) / 1100));
      } else if (phase === "accuracy" && meterStart.current !== null) {
        const n = lockedPower.current - (now - meterStart.current) / 520;
        setNeedle(n);
        if (n < -0.2) {
          // Missed the tap: a late, sliced strike.
          finish(1);
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  const finish = (accuracy: number) => {
    meterStart.current = null;
    lastPower.current = lockedPower.current;
    void shoot({ club, aim, power: Math.max(0.02, lockedPower.current), accuracy });
  };

  const pressSwing = () => {
    if (!canShoot || busy.current) return;
    if (phase === "ready") {
      meterStart.current = performance.now();
      setPhase("power");
    } else if (phase === "accuracy" && meterStart.current !== null) {
      // Tap timing → accuracy: early (needle above 0) hooks, late slices. Computed from real elapsed time
      // (not the last drawn frame), so it's correct even if the browser throttles animation.
      const n = lockedPower.current - (performance.now() - meterStart.current) / 520;
      const acc = Math.max(-1, Math.min(1, -n / 0.18));
      finish(Math.abs(acc) < 0.08 ? 0 : acc);
    }
  };
  const releaseSwing = () => {
    if (phase !== "power" || meterStart.current === null) return;
    lockedPower.current = Math.max(0.02, Math.min(1, (performance.now() - meterStart.current) / 1100));
    if (club === "putter") {
      meterStart.current = null;
      lastPower.current = lockedPower.current;
      void shoot({ club, aim, power: lockedPower.current, accuracy: 0 });
      return;
    }
    meterStart.current = performance.now();
    setNeedle(lockedPower.current);
    setPhase("accuracy");
  };

  // Keyboard: ←/→ aim, ↑/↓ club, Space swing.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const step = e.shiftKey ? 0.002 : 0.012;
      if (e.key === "ArrowLeft") setAim((a) => a - step);
      else if (e.key === "ArrowRight") setAim((a) => a + step);
      else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        const i = CLUBS.findIndex((c) => c.id === club);
        const next = CLUBS[Math.max(0, Math.min(CLUBS.length - 1, i + (e.key === "ArrowUp" ? -1 : 1)))]!;
        setClub(next.id);
      } else if (e.key === " " && !e.repeat) pressSwing();
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        releaseSwing();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  const windSpeed = Math.hypot(hole.wind.x, hole.wind.z);
  // Wind direction relative to the aim (screen: up = down-range).
  const windRel = Math.atan2(hole.wind.x, -hole.wind.z) - aim;
  const carry = useMemo(() => {
    const c = getClub(club);
    return c ? Math.round(simulateShot({ ...hole, wind: { x: 0, z: 0 } }, { x: 0, z: 0, lie: "tee" }, { club, aim: 0, power: 1, accuracy: 0 }).total) : 0;
  }, [club, hole]);

  const toggleQuality = () => {
    const q: Quality = quality === "high" ? "low" : "high";
    setQuality(q);
    viewRef.current?.setQuality(q);
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#9cc6e8] touch-none">
      <canvas ref={canvasRef} className="block h-full w-full" />
      <div
        className="absolute inset-0"
        role="application"
        aria-label="Course. Drag left or right to aim."
        onPointerDown={(e) => {
          if (!canShoot || phase !== "ready") return;
          drag.current = { x: e.clientX, aim };
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const w = (e.currentTarget as HTMLElement).clientWidth;
          setAim(drag.current.aim + ((e.clientX - drag.current.x) / w) * (club === "putter" ? 0.6 : 1.2));
        }}
        onPointerUp={() => (drag.current = null)}
      />

      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#0b1020]" role="status">
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <p className="font-display text-lg font-bold uppercase tracking-wider">Preparing the course…</p>
        </div>
      )}
      {phase === "error" && <div className="absolute inset-0 flex items-center justify-center bg-[#0b1020] p-6 text-center" role="alert">{error}</div>}

      <div className="pointer-events-none absolute inset-x-0 top-0 pt-safe">{children}</div>

      {phase !== "loading" && phase !== "error" && (
        <>
          {/* Hole info */}
          <div className="pointer-events-none absolute left-3 top-[calc(var(--safe-top)+5.2rem)] glass rounded-2xl px-3 py-2 text-xs">
            <p className="font-display text-lg font-black uppercase leading-none">Hole {hole.index + 1} · Par {hole.par}</p>
            <p className="mt-0.5 text-white/80">{Math.round(dist)} m to pin · {LIE_LABEL[ball.lie]}</p>
            <p className="mt-1 flex items-center gap-1.5 text-white/80">
              <Wind className="size-3.5" aria-hidden /> {windSpeed.toFixed(1)} m/s
              <span aria-hidden className="inline-block text-base leading-none" style={{ transform: `rotate(${(windRel * 180) / Math.PI}deg)` }}>↑</span>
            </p>
          </div>
          <button
            type="button"
            onClick={toggleQuality}
            className="glass absolute right-3 top-[calc(var(--safe-top)+5.2rem)] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase"
            aria-label={`Graphics quality: ${quality}. Switch.`}
          >
            {quality === "high" ? <Monitor className="size-3.5" aria-hidden /> : <Smartphone className="size-3.5" aria-hidden />} {quality === "high" ? "High" : "Lite"}
          </button>

          <div className="absolute inset-x-0 bottom-0 pb-safe">
            {error && <p role="alert" className="mx-auto mb-2 w-fit rounded-lg bg-destructive/80 px-3 py-1.5 text-sm">{error}</p>}
            {canShoot ? (
              <div className="mx-auto max-w-2xl px-3 pb-3" onPointerDown={(e) => e.stopPropagation()}>
                <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label="Club">
                  {CLUBS.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={club === c.id}
                      disabled={phase !== "ready"}
                      onClick={() => setClub(c.id)}
                      className={cn("h-9 min-w-11 shrink-0 rounded-lg px-2 font-display text-sm font-black", club === c.id ? "bg-gradient-primary text-primary-foreground" : "glass")}
                      title={c.name}
                    >
                      {c.short}
                    </button>
                  ))}
                </div>
                <div className="glass flex items-center gap-3 rounded-2xl p-2.5">
                  <button type="button" aria-label="Aim left" className="flex size-11 items-center justify-center rounded-xl bg-secondary" onClick={() => setAim((a) => a - (club === "putter" ? 0.01 : 0.02))} disabled={phase !== "ready"}>
                    <ChevronLeft aria-hidden />
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-[11px] font-bold uppercase tracking-wider text-white/70">
                      <span>{getClub(club)?.name} · ~{carry} m</span>
                      <span>{phase === "accuracy" ? "Tap at the line!" : phase === "power" ? `${Math.round(power * 100)}%` : "Hold to swing"}</span>
                    </div>
                    {/* Swing meter: fills with power; the needle sweeps back for the accuracy tap. */}
                    <div className="relative mt-1 h-4 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Swing power" aria-valuenow={Math.round((phase === "accuracy" ? needle : power) * 100)}>
                      <div className="absolute inset-y-0 left-[15%] right-0">
                        <div className="h-full bg-gradient-hot" style={{ width: `${(phase === "accuracy" ? lockedPower.current : power) * 100}%` }} />
                        {phase === "accuracy" && <div className="absolute inset-y-0 w-1 bg-white" style={{ left: `${Math.max(-15, needle * 100)}%` }} />}
                      </div>
                      <div className="absolute inset-y-0 left-[15%] w-0.5 bg-gold" aria-hidden />
                    </div>
                  </div>
                  <button type="button" aria-label="Aim right" className="flex size-11 items-center justify-center rounded-xl bg-secondary" onClick={() => setAim((a) => a + (club === "putter" ? 0.01 : 0.02))} disabled={phase !== "ready"}>
                    <ChevronRight aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={phase === "playing"}
                    onPointerDown={(e) => { e.stopPropagation(); pressSwing(); }}
                    onPointerUp={(e) => { e.stopPropagation(); releaseSwing(); }}
                    className={cn("h-12 rounded-xl px-5 font-display text-lg font-black uppercase text-accent-foreground shadow-hot", phase === "accuracy" ? "bg-gold" : "bg-gradient-hot")}
                  >
                    {phase === "accuracy" ? "Tap!" : phase === "power" ? "Release" : club === "putter" ? "Putt" : "Swing"}
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[11px] text-white/70">
                  Drag the view to aim · hold Swing for power, release, then tap as the needle crosses the gold line (early hooks, late slices) · ←/→ aim · ↑/↓ club · Space
                </p>
              </div>
            ) : (
              <p className="mx-auto mb-4 w-fit rounded-full bg-black/60 px-4 py-2 font-display text-lg font-bold uppercase tracking-wider">
                {phase === "playing" ? "Watching the shot…" : (waitingLabel ?? "Waiting…")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
