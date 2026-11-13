import { Loader2, Monitor, Smartphone } from "lucide-react";
import { ControlsHelpButton } from "@/components/game/ControlsGuide";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { AlleyAudio } from "@/game/bowling/audio";
import { THROW_LIMITS, type ThrowInput } from "@/game/bowling/constants";
import { clamp, powerAt, powerToSpeed, swipeToThrow, type SwipeSample } from "@/game/bowling/controls";
import type { BowlingView, Quality } from "@/game/bowling/renderer";
import type { SimResult } from "@/game/bowling/sim";
import type { Reaction } from "@/game/bowling/bowler";
import type { AvatarConfig } from "@/lib/avatar";
import { settingsStore } from "@/lib/settings";
import { cn } from "@/lib/utils";
import { FullscreenButton } from "@/components/game/FullscreenButton";

export interface StageReplay { id: string; result: SimResult; avatar?: AvatarConfig | null }

/** How the bowler and crowd react to a ball, from pins standing before vs. knocked down. */
export function reactionFor(result: SimResult): Reaction {
  const before = result.pins.length;
  const k = result.knocked.length;
  if (before === 10 && k === 10) return "strike";
  if (before < 10 && k === before) return "spare";
  if (k >= 7) return "good";
  return "miss";
}

interface Props {
  /** Pins shown standing while waiting for the next ball. */
  rack: readonly number[];
  /** Whether the local player may throw now. */
  canThrow: boolean;
  /** Produce the simulated result for a throw (locally in practice, from the server online). */
  onThrow: (input: ThrowInput) => Promise<SimResult>;
  /** Called after the throw's replay has finished playing. */
  onThrowShown?: (result: SimResult) => void;
  /** An external replay to show (the opponent's throw). Played once per id. */
  replay?: StageReplay | null;
  onReplayShown?: (id: string) => void;
  /** Character of whoever is bowling now (shown on the approach). */
  avatar?: AvatarConfig | null;
  /** Status line shown when the player can't throw. */
  waitingLabel?: string;
  /** Scoreboard and other overlays. */
  children?: ReactNode;
}

type Phase = "loading" | "error" | "ready" | "charging" | "rolling";

export function BowlingStage({ rack, canThrow, onThrow, onThrowShown, replay, onReplayShown, avatar, waitingLabel, children }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<BowlingView | null>(null);
  const audioRef = useRef<AlleyAudio | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [aim, setAim] = useState({ x: 0, angle: 0, spin: 0.35 });
  const [power, setPower] = useState(0);
  const [quality, setQuality] = useState<Quality>("high");
  const chargeStart = useRef<number | null>(null);
  const swipe = useRef<SwipeSample[] | null>(null);
  const playedReplays = useRef(new Set<string>());
  /** Hard guard against overlapping throws (state updates are async). */
  const throwing = useRef(false);
  const [banner, setBanner] = useState<{ text: string; kind: Reaction; id: number } | null>(null);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 2200);
    return () => clearTimeout(t);
  }, [banner]);
  const busy = phase === "rolling" || phase === "loading";

  // Boot the 3D engine (client only).
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { createBowlingView, detectQuality } = await import("@/game/bowling/renderer");
        const q = detectQuality();
        if (!canvasRef.current || disposed) return;
        const view = await createBowlingView(canvasRef.current, q);
        if (disposed) return view.destroy();
        viewRef.current = view;
        audioRef.current = new AlleyAudio();
        setQuality(q);
        setPhase("ready");
      } catch (e) {
        console.error("[bowling] failed to start 3D view", e);
        setError("Your browser couldn't start the 3D view. Try updating your browser or enabling hardware acceleration.");
        setPhase("error");
      }
    })();
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      audioRef.current?.dispose();
    };
  }, []);

  // Keep the scene in sync with the rack and aim while idle.
  useEffect(() => {
    if (phase === "ready" || phase === "charging") viewRef.current?.setRack(rack);
  }, [rack, phase]);
  useEffect(() => {
    if (phase === "ready" || phase === "charging") viewRef.current?.setAim(aim, canThrow);
  }, [aim, canThrow, phase]);
  useEffect(() => {
    if (phase !== "rolling") viewRef.current?.setBowler(avatar ?? null);
  }, [avatar, phase]);

  const playResult = useCallback(async (result: SimResult, who: AvatarConfig | null | undefined, keepBowler = false) => {
    const view = viewRef.current;
    const audio = audioRef.current;
    if (!view) return;
    if (audio) audio.enabled = settingsStore.read().sound;
    setPhase("rolling");
    if (!keepBowler) view.setBowler(who ?? null);
    await view.play(result, {
      reaction: reactionFor(result),
      onRelease: () => audio?.startRoll(),
      onImpact: () => {
        audio?.crash(Math.min(1, 0.3 + result.knocked.length / 10));
        const r = reactionFor(result);
        const text = r === "strike" ? "STRIKE!" : r === "spare" ? "SPARE!" : result.gutter ? "GUTTER" : result.knocked.length === 0 ? "MISS" : `${result.knocked.length} PIN${result.knocked.length === 1 ? "" : "S"}`;
        setBanner({ text, kind: r, id: Date.now() });
        if (r === "strike") setTimeout(() => audio?.applause(1), 250);
        else if (r === "spare") setTimeout(() => audio?.applause(0.6), 250);
      },
    });
    audio?.stopRoll();
  }, []);

  const doThrow = useCallback(
    async (input: ThrowInput) => {
      if (!canThrow || busy || throwing.current) return;
      throwing.current = true;
      console.info("[bowling] throw", JSON.stringify(input));
      setPhase("rolling");
      // Instant response: the bowler starts the run-up now; the server's result arrives during it.
      viewRef.current?.setBowler(avatar ?? null);
      viewRef.current?.beginApproach(input.x);
      try {
        const result = await onThrow(input);
        console.info("[bowling] result", JSON.stringify({ knocked: result.knocked, standing: result.standing, gutter: result.gutter, frames: result.frames.length }));
        await playResult(result, avatar, true);
        onThrowShown?.(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That throw couldn't be processed.");
      } finally {
        throwing.current = false;
        setPhase("ready");
        setPower(0);
      }
    },
    [avatar, busy, canThrow, onThrow, onThrowShown, playResult],
  );

  // Play an opponent's throw when it arrives.
  useEffect(() => {
    if (!replay || phase !== "ready" || playedReplays.current.has(replay.id)) return;
    playedReplays.current.add(replay.id);
    void (async () => {
      await playResult(replay.result, replay.avatar);
      setPhase("ready");
      onReplayShown?.(replay.id);
    })();
  }, [replay, phase, playResult, onReplayShown]);

  // Hold-to-charge power meter.
  useEffect(() => {
    if (phase !== "charging") return undefined;
    let raf = 0;
    const tick = () => {
      if (chargeStart.current !== null) setPower(powerAt(performance.now() - chargeStart.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const startCharge = () => {
    if (!canThrow || phase !== "ready") return;
    chargeStart.current = performance.now();
    setPhase("charging");
  };
  const releaseCharge = () => {
    if (phase !== "charging" || chargeStart.current === null) return;
    const p = powerAt(performance.now() - chargeStart.current);
    chargeStart.current = null;
    setPhase("ready");
    void doThrow({ x: aim.x, angle: aim.angle, spin: aim.spin, speed: powerToSpeed(p) });
  };

  // Keyboard: ←/→ position, A/D aim, Q/E spin, hold Space to charge.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      const step = e.shiftKey ? 0.002 : 0.01;
      if (e.key === "ArrowLeft") setAim((a) => ({ ...a, x: clamp(a.x - step * 2, -THROW_LIMITS.maxStartX, THROW_LIMITS.maxStartX) }));
      else if (e.key === "ArrowRight") setAim((a) => ({ ...a, x: clamp(a.x + step * 2, -THROW_LIMITS.maxStartX, THROW_LIMITS.maxStartX) }));
      else if (e.key === "a" || e.key === "A") setAim((a) => ({ ...a, angle: clamp(a.angle - step * 0.3, -THROW_LIMITS.maxAngle, THROW_LIMITS.maxAngle) }));
      else if (e.key === "d" || e.key === "D") setAim((a) => ({ ...a, angle: clamp(a.angle + step * 0.3, -THROW_LIMITS.maxAngle, THROW_LIMITS.maxAngle) }));
      else if (e.key === "q" || e.key === "Q") setAim((a) => ({ ...a, spin: clamp(a.spin + 0.05, -1, 1) }));
      else if (e.key === "e" || e.key === "E") setAim((a) => ({ ...a, spin: clamp(a.spin - 0.05, -1, 1) }));
      else if (e.key === " " && !e.repeat) {
        e.preventDefault();
        startCharge();
      } else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        releaseCharge();
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  });

  // Swipe-to-bowl on the lane.
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canThrow || phase !== "ready") return;
    swipe.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (swipe.current) swipe.current.push({ x: e.clientX, y: e.clientY, t: performance.now() });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const path = swipe.current;
    swipe.current = null;
    if (!path) return;
    path.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const t = swipeToThrow(path, { width: rect.width, height: rect.height }, aim.x);
    if (t) {
      setAim((a) => ({ ...a, angle: t.angle, spin: t.spin }));
      void doThrow(t);
    }
  };

  const toggleQuality = () => {
    const q: Quality = quality === "high" ? "low" : "high";
    setQuality(q);
    viewRef.current?.setQuality(q);
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#03040a] touch-none">
      <canvas ref={canvasRef} className="block h-full w-full" />
      {banner && (
        <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[40%] z-10 flex justify-center" aria-live="assertive">
          <span className={cn("animate-rise font-display font-black italic uppercase tracking-wide drop-shadow-[0_6px_24px_rgba(0,0,0,0.6)]",
            banner.kind === "strike" ? "bg-gradient-to-b from-[#fff3b0] via-[#ffd23f] to-[#ff7a1a] bg-clip-text text-7xl text-transparent sm:text-9xl"
              : banner.kind === "spare" ? "bg-gradient-to-b from-white to-[#20e3ff] bg-clip-text text-6xl text-transparent sm:text-8xl"
              : "rounded-2xl bg-black/55 px-6 py-1 text-4xl text-white sm:text-6xl")}>
            {banner.text}
          </span>
        </div>
      )}
      <div
        className="absolute inset-0"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => (swipe.current = null)}
        aria-label="Lane. Swipe up to bowl."
        role="application"
      />

      {phase === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#03040a]" role="status">
          <Loader2 className="size-10 animate-spin text-primary" aria-hidden />
          <p className="font-display text-lg font-bold uppercase tracking-wider">Setting up the lane…</p>
        </div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center" role="alert">
          <p className="max-w-sm">{error}</p>
        </div>
      )}

      {/* Overlays from the parent (scoreboard etc.) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 pt-safe">{children}</div>

      {phase !== "loading" && phase !== "error" && (
        <>
          <div className="absolute left-3 top-[calc(var(--safe-top)+5.5rem)] flex gap-2">
            <ControlsHelpButton sport="bowling" />
            <FullscreenButton />
          </div>
          <button
            type="button"
            onClick={toggleQuality}
            className="glass absolute right-3 top-[calc(var(--safe-top)+5.5rem)] flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase"
            aria-label={`Graphics quality: ${quality}. Switch.`}
          >
            {quality === "high" ? <Monitor className="size-3.5" aria-hidden /> : <Smartphone className="size-3.5" aria-hidden />} {quality === "high" ? "High" : "Lite"}
          </button>

          <div className="absolute inset-x-0 bottom-0 pb-safe">
            {error && <p role="alert" className="mx-auto mb-2 w-fit rounded-lg bg-destructive/80 px-3 py-1.5 text-sm">{error}</p>}
            {canThrow ? (
              <div className="mx-auto max-w-xl px-3 pb-3">
                <div className="glass grid grid-cols-3 gap-3 rounded-2xl p-3 text-xs">
                  <Slider label="Position" value={aim.x} min={-THROW_LIMITS.maxStartX} max={THROW_LIMITS.maxStartX} step={0.005} disabled={busy}
                    onChange={(v) => setAim((a) => ({ ...a, x: v }))} format={(v) => `${Math.round(20 - v / (1.0541 / 39))} board`} />
                  <Slider label="Aim" value={aim.angle} min={-THROW_LIMITS.maxAngle} max={THROW_LIMITS.maxAngle} step={0.001} disabled={busy}
                    onChange={(v) => setAim((a) => ({ ...a, angle: v }))} format={(v) => `${((v * 180) / Math.PI).toFixed(1)}°`} />
                  <Slider label="Hook" value={-aim.spin} min={-1} max={1} step={0.05} disabled={busy}
                    onChange={(v) => setAim((a) => ({ ...a, spin: -v }))} format={(v) => (Math.abs(v) < 0.05 ? "Straight" : `${Math.round(Math.abs(v) * 100)}% ${v < 0 ? "left" : "right"}`)} />
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted" role="meter" aria-label="Power" aria-valuenow={Math.round(power * 100)} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-gradient-hot" style={{ width: `${power * 100}%` }} />
                  </div>
                  <button
                    type="button"
                    disabled={busy}
                    onPointerDown={(e) => { e.stopPropagation(); startCharge(); }}
                    onPointerUp={(e) => { e.stopPropagation(); releaseCharge(); }}
                    className={cn("h-14 rounded-2xl px-8 font-display text-xl font-black uppercase tracking-wider text-accent-foreground shadow-hot transition-transform active:scale-95 disabled:opacity-50", phase === "charging" ? "bg-gold" : "bg-gradient-hot")}
                  >
                    {phase === "charging" ? "Release!" : phase === "rolling" ? "Rolling…" : "Hold to roll"}
                  </button>
                </div>
                <p className="mt-1.5 text-center text-[11px] text-white/60">
                  Swipe up on the lane to bowl (curl the swipe for hook) · or hold the button / Space · ←/→ move · A/D aim · Q/E hook
                </p>
              </div>
            ) : (
              <p className="mx-auto mb-4 w-fit rounded-full bg-black/60 px-4 py-2 font-display text-lg font-bold uppercase tracking-wider">
                {phase === "rolling" ? "Watching the throw…" : (waitingLabel ?? "Waiting…")}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange, format, disabled }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format: (v: number) => string; disabled?: boolean }) {
  return (
    <label className="block" onPointerDown={(e) => e.stopPropagation()}>
      <span className="flex justify-between font-bold uppercase tracking-wider text-white/70">
        {label} <span className="font-mono normal-case text-white">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--primary)]" />
    </label>
  );
}
