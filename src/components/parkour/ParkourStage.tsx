import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Hand, Loader2, Monitor, MoveUp, RotateCcw, Smartphone, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ControlsHelpButton } from "@/components/game/ControlsGuide";
import { FullscreenButton } from "@/components/game/FullscreenButton";
import { ctlStyle, GameSettingsButton, RotateHint, useGameSurface } from "@/components/game/GameSurface";
import { ParkourAudio } from "@/game/parkour/audio";
import type { ParkourDriver } from "@/game/parkour/driver";
import type { ParkourView, Quality } from "@/game/parkour/renderer";
import { moveIsLit, nextMove, placings, progress, type Key, type MoveHint, type RaceState } from "@/game/parkour/sim";
import type { AvatarConfig } from "@/lib/avatar";
import { getGameSettings, useGameSettings } from "@/lib/game-settings";
import { buzz, useTouchMode } from "@/lib/input-mode";
import { cn } from "@/lib/utils";

interface Props {
  driver: ParkourDriver;
  names: string[];
  avatars: (AvatarConfig | null)[];
  colors: string[];
  /** Shown over the scene once the race is over. */
  renderEnd: (s: RaceState) => ReactNode;
  topRight?: ReactNode;
}

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th"];

const MOVE_LABEL: Record<MoveHint, string> = { jump: "Jump", vault: "Vault", climb: "Climb", grab: "Grab", slide: "Slide", roll: "Roll" };

export function formatRaceTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m ? `${m}:${s.toFixed(2).padStart(5, "0")}` : `${s.toFixed(2)}`;
}

interface Hud {
  count: number;
  live: boolean;
  time: number;
  place: number;
  combo: number;
  speed: number;
  prog: number[];
  move: MoveHint | null;
  urgent: boolean;
  steer: -1 | 0 | 1;
  lane: number;
  airborne: boolean;
}

export function ParkourStage({ driver, names, avatars, colors, renderEnd, topRight }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useGameSurface(surfaceRef);
  const [settings] = useGameSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ParkourView | null>(null);
  const audioRef = useRef<ParkourAudio | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [quality, setQuality] = useState<Quality>("high");
  const [sound, setSound] = useState(true);
  const touch = useTouchMode();
  const [hud, setHud] = useState<Hud>({ count: 3, live: false, time: 0, place: 1, combo: 0, speed: 0, prog: [], move: null, urgent: false, steer: 0, lane: 1, airborne: false });
  const [banner, setBanner] = useState<{ text: string; sub?: string; tone: "good" | "bad" | "info" | "gold"; id: number } | null>(null);
  const [over, setOver] = useState<RaceState | null>(null);
  const [pressed, setPressed] = useState<{ act: boolean; slide: boolean }>({ act: false, slide: false });
  const slideKeys = useRef(new Set<string>());

  // 3D view.
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { createParkourView, detectQuality } = await import("@/game/parkour/renderer");
        const q = detectQuality();
        if (!canvasRef.current || disposed) return;
        const view = await createParkourView(canvasRef.current, q);
        if (disposed) return view.destroy();
        viewRef.current = view;
        setQuality(q);
        setPhase("ready");
      } catch (e) {
        console.error("[parkour] failed to start 3D view", e);
        setPhase("error");
      }
    })();
    audioRef.current = new ParkourAudio();
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      audioRef.current?.destroy();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    audioRef.current?.setEnabled(sound);
  }, [sound]);

  const courseSeed = driver.state()?.course.seed;
  useEffect(() => {
    if (phase !== "ready") return;
    const s = driver.state();
    if (!s) return;
    viewRef.current!.setCourse(s.course, s.runners.length);
    viewRef.current!.setRunners(avatars.map((a, i) => ({ avatar: a, color: colors[i] ?? "#ffffff" })));
    setOver(null);
  }, [phase, driver, courseSeed, avatars, colors]);

  const press = (key: Key, down: boolean) => {
    audioRef.current?.unlock();
    driver.press(key, down);
    if (down && (key === "J" || key === "S")) buzz(8);
  };

  // Keyboard: ←/→ or A/D steer, Space/↑/W action, ↓/S slide (in the air: roll).
  useEffect(() => {
    const kind = (k: string): Key | null => {
      const u = k.length === 1 ? k.toLowerCase() : k;
      if (u === " " || u === "ArrowUp" || u === "w") return "J";
      if (u === "ArrowDown" || u === "s") return "S";
      if (u === "ArrowLeft" || u === "a") return "L";
      if (u === "ArrowRight" || u === "d") return "R";
      return null;
    };
    const down = (e: KeyboardEvent) => {
      const k = kind(e.key);
      if (!k) return;
      e.preventDefault();
      if (e.repeat) return;
      if (k === "S") {
        slideKeys.current.add(e.key);
        if (slideKeys.current.size > 1) return;
      }
      press(k, true);
    };
    const up = (e: KeyboardEvent) => {
      if (kind(e.key) !== "S") return;
      slideKeys.current.delete(e.key);
      if (slideKeys.current.size === 0) press("S", false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver]);

  // Game loop.
  useEffect(() => {
    if (phase !== "ready") return;
    let raf = 0, last = performance.now(), hudAt = 0, lastCount = -1, endTimer: ReturnType<typeof setTimeout> | null = null, music = false;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const events = driver.update(dt);
      const s = driver.state();
      if (!s) return;
      const v = driver.viewer;
      const me = s.runners[v]!;
      const audio = audioRef.current;
      const view = viewRef.current;
      const order = placings(s);
      const celebrate = s.runners.map((r, i) => (r.finish === null ? 0 : order.indexOf(i) === 0 ? 1 : s.phase === "over" && order.indexOf(i) === s.runners.length - 1 ? -1 : 0));
      view?.setState(s, v, celebrate);

      if (s.phase === "ready") {
        const c = Math.ceil(s.goAt - s.t);
        if (c !== lastCount && c <= 3 && c >= 1) {
          lastCount = c;
          audio?.beep(false);
        }
      }
      if (s.phase === "live" && !music) {
        music = true;
        audio?.music(true);
      }
      for (const e of events) {
        const mine = e.a === v;
        switch (e.kind) {
          case "go":
            audio?.beep(true);
            setBanner({ text: "GO!", tone: "info", id: now });
            break;
          case "step":
            if (mine) audio?.step(1);
            break;
          case "jump":
          case "vault":
            if (mine) audio?.jump();
            break;
          case "grab":
            if (mine) {
              audio?.climb();
              buzz(15);
            }
            break;
          case "land":
            if (mine) {
              audio?.land(Math.min(1, Number(e.detail ?? 0.5)));
              buzz(10);
            }
            if (e.a !== undefined) view?.fx("land", e.a);
            break;
          case "slide":
          case "roll":
            if (mine) audio?.slide();
            break;
          case "climb":
            if (mine) audio?.climb();
            break;
          case "lane":
            if (mine) audio?.step(0.6);
            break;
          case "perfect":
            if (e.a !== undefined) view?.fx("perfect", e.a);
            if (mine) {
              audio?.perfect();
              buzz([8, 30, 8]);
              const t = { wall: "Wall run!", pipe: "Clean slide!", gap: "Big leap!", swing: "Swing!", roll: "Perfect roll!", rail: "Speed vault!", vent: "Perfect vault!" } as Record<string, string>;
              setBanner({ text: t[e.detail ?? ""] ?? "Perfect!", sub: me.combo > 2 ? `${me.combo}× combo` : undefined, tone: "gold", id: now });
            }
            break;
          case "pad":
            if (e.a !== undefined) view?.fx("pad", e.a);
            if (mine) {
              audio?.pad();
              setBanner({ text: "Speed boost!", tone: "info", id: now });
            }
            break;
          case "hit":
            if (e.a !== undefined) view?.fx("hit", e.a);
            if (mine) {
              audio?.hit();
              buzz(60);
              const t = { pipe: "Ouch! Slide under", wall: "Jump at walls to climb!", landing: "Hard landing! Roll before you land", rail: "Vault the rail!" } as Record<string, string>;
              setBanner({ text: t[e.detail ?? ""] ?? "Tripped! Vault earlier or steer round", tone: "bad", id: now });
            }
            break;
          case "fall":
            if (mine) {
              audio?.fall();
              buzz([40, 40, 80]);
              setBanner({ text: e.detail === "swing" ? "Grab the bar!" : "Missed the jump!", sub: me.failN >= 2 ? "Next time you'll be helped across" : e.detail === "swing" ? "Too wide to jump: press Action at the edge" : "Jump right at the edge", tone: "bad", id: now });
            }
            break;
          case "finish": {
            const place = s.order.indexOf(e.a ?? -1);
            if (e.a !== undefined) view?.fx("finish", e.a);
            if (mine) {
              audio?.music(false);
              if (place === 0) audio?.cheer();
              else audio?.lose();
              setBanner({ text: `${ORD[place] ?? `${place + 1}th`}!`, sub: `${formatRaceTime(Number(e.detail))} s`, tone: place === 0 ? "gold" : "info", id: now });
            }
            break;
          }
          default:
            break;
        }
      }
      audio?.speed(s.phase === "live" ? me.vx + me.boost : 0);
      if (s.phase === "over" && !endTimer) {
        audio?.music(false);
        endTimer = setTimeout(() => setOver(s), 1800);
      }
      if (now - hudAt > 50) {
        hudAt = now;
        const n = me.state !== "done" ? nextMove(s, me) : null;
        const show = n && (n.move === "roll" || n.dist < 22) ? n : null;
        // Vent or pipe in your lane with a clear lane next door: suggest steering.
        let steer: -1 | 0 | 1 = 0;
        if (show && (show.move === "vault" || show.move === "slide") && show.o.kind !== "rail" && show.free && !(show.free & (1 << me.lane))) {
          if (me.lane > 0 && show.free & (1 << (me.lane - 1))) steer = -1;
          else if (me.lane < 2 && show.free & (1 << (me.lane + 1))) steer = 1;
        }
        setHud({
          count: Math.max(0, Math.ceil(s.goAt - s.t)),
          live: s.phase !== "ready",
          time: s.phase === "ready" ? 0 : me.finish ?? Math.max(0, s.t - s.goAt),
          place: order.indexOf(v) + 1,
          combo: me.combo,
          speed: Math.min(1, (me.vx + me.boost) / 11),
          prog: s.runners.map((_, i) => progress(s, i)),
          move: show ? show.move : null,
          urgent: show ? moveIsLit(me, show) : false,
          steer,
          lane: me.lane,
          airborne: me.state === "air",
        });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (endTimer) clearTimeout(endTimer);
      audioRef.current?.music(false);
    };
  }, [phase, driver]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 1500);
    return () => clearTimeout(t);
  }, [banner]);

  // ---- Touch controls ----
  // Steering pad: touching a side steers one lane immediately; dragging further steps again.
  const steerRef = useRef(new Map<number, { x: number }>());
  const stepPx = () => 70 - getGameSettings().camSensitivity * 40;
  const onSteerDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const r = e.currentTarget.getBoundingClientRect();
    press(e.clientX < r.left + r.width / 2 ? "L" : "R", true);
    steerRef.current.set(e.pointerId, { x: e.clientX });
  };
  const onSteerMove = (e: RPointerEvent<HTMLDivElement>) => {
    const t = steerRef.current.get(e.pointerId);
    if (!t) return;
    const dx = e.clientX - t.x;
    if (Math.abs(dx) > stepPx()) {
      press(dx < 0 ? "L" : "R", true);
      t.x = e.clientX;
    }
  };
  const onSteerUp = (e: RPointerEvent<HTMLDivElement>) => {
    steerRef.current.delete(e.pointerId);
  };

  // Buttons fire on touch-down (no waiting for release); slide is held.
  const btnDown = (key: "J" | "S") => (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    press(key, true);
    setPressed((p) => ({ ...p, [key === "J" ? "act" : "slide"]: true }));
  };
  const btnUp = (key: "J" | "S") => (e: RPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (key === "S") press("S", false);
    setPressed((p) => ({ ...p, [key === "J" ? "act" : "slide"]: false }));
  };

  // Swipes on open screen: exactly one move per swipe.
  const swipeRef = useRef(new Map<number, { x: number; y: number; done: boolean; slid: boolean }>());
  const onSwipeDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    swipeRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, done: false, slid: false });
  };
  const onSwipeMove = (e: RPointerEvent<HTMLDivElement>) => {
    const t = swipeRef.current.get(e.pointerId);
    if (!t || t.done) return;
    const dx = e.clientX - t.x, dy = e.clientY - t.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 34) return;
    t.done = true;
    if (Math.abs(dy) > Math.abs(dx)) {
      if (dy < 0) press("J", true);
      else {
        press("S", true);
        t.slid = true;
      }
    } else press(dx < 0 ? "L" : "R", true);
  };
  const onSwipeUp = (e: RPointerEvent<HTMLDivElement>) => {
    const t = swipeRef.current.get(e.pointerId);
    swipeRef.current.delete(e.pointerId);
    if (t?.slid) press("S", false);
    // A plain click with a mouse = action, so laptop players can click too.
    else if (t && !t.done && e.pointerType === "mouse") press("J", true);
  };

  const left = settings.hand === "left";
  const actLabel = hud.move && hud.move !== "slide" && hud.move !== "roll" ? MOVE_LABEL[hud.move] : "Jump";
  const slideLabel = hud.airborne || hud.move === "roll" ? "Roll" : "Slide";
  const actHot = hud.urgent && hud.move !== null && hud.move !== "slide" && hud.move !== "roll";
  const slideHot = hud.urgent && (hud.move === "slide" || hud.move === "roll");

  return (
    <div ref={surfaceRef} style={ctlStyle(settings)} className="game-surface relative h-dvh w-full touch-none select-none overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="3D rooftop parkour race" />
      {phase === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white"><Loader2 className="mr-2 size-6 animate-spin" aria-hidden /> Building the city…</div>}
      {phase === "error" && <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-white">Your browser couldn't start the 3D view. Try updating your browser or enabling hardware acceleration.</div>}

      {/* Swipe surface (under everything else). */}
      {phase === "ready" && !over && (
        <div className="absolute inset-0" onPointerDown={onSwipeDown} onPointerMove={onSwipeMove} onPointerUp={onSwipeUp} onPointerCancel={onSwipeUp} aria-hidden />
      )}

      {/* Top-left: place, time, combo. */}
      <div className="pointer-events-none absolute left-safe top-3 pt-safe text-white">
        <div className="glass rounded-xl px-3 py-2 sm:px-4">
          <p className="font-display text-3xl font-black uppercase leading-none sm:text-4xl">{ORD[hud.place - 1] ?? hud.place}<span className="text-base text-white/60">/{names.length}</span></p>
          <p className="text-sm tabular-nums text-white/85">{hud.live ? formatRaceTime(hud.time) : "Get ready"}</p>
        </div>
        {hud.combo >= 2 && <p className="mt-2 w-fit rounded-full bg-[#ffd23f] px-3 py-0.5 text-xs font-black uppercase text-black">{hud.combo}× combo</p>}
      </div>

      <div className="absolute right-safe top-3 flex max-w-[62vw] flex-wrap justify-end gap-2 pt-safe">
        <button type="button" onClick={() => setSound((v) => !v)} className="glass rounded-full p-2 text-white" aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}</button>
        <button type="button" onClick={() => { const q = quality === "high" ? "low" : "high"; setQuality(q); viewRef.current?.setQuality(q); }} className="glass rounded-full p-2 text-white" aria-label={`Graphics: ${quality}. Switch.`}>{quality === "high" ? <Monitor className="size-5" /> : <Smartphone className="size-5" />}</button>
        <GameSettingsButton />
        <ControlsHelpButton sport="parkour" />
        <FullscreenButton />
        {topRight}
      </div>

      {/* Course progress. */}
      {hud.prog.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-[calc(var(--safe-top)+4.6rem)] w-[min(60vw,520px)] -translate-x-1/2 sm:top-4" aria-hidden>
          <div className="relative h-2 rounded-full bg-black/45">
            <div className="absolute right-0 top-1/2 h-4 w-1 -translate-y-1/2 bg-white" />
            {hud.prog.map((p, i) => (
              <span key={i} className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/60", i === driver.viewer ? "z-10 size-4" : "size-3")} style={{ left: `${p * 100}%`, background: colors[i] }} />
            ))}
          </div>
        </div>
      )}

      {phase === "ready" && !hud.live && hud.count > 0 && (
        <div key={hud.count} className="pointer-events-none absolute inset-x-0 top-[26%] text-center font-display text-8xl font-black text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.7)] animate-rise" aria-live="assertive">{hud.count}</div>
      )}
      {banner && (
        <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[18%] flex justify-center px-4" aria-live="assertive">
          <div className={cn("animate-rise rounded-2xl px-5 py-2 text-center text-white shadow-xl", banner.tone === "gold" ? "bg-gradient-to-r from-[#ff7a1a] to-[#ffd23f] text-black" : banner.tone === "bad" ? "bg-[#b4233a]/90" : "bg-black/60")}>
            <p className="font-display text-2xl font-black uppercase sm:text-4xl">{banner.text}</p>
            {banner.sub && <p className="text-sm font-bold opacity-85">{banner.sub}</p>}
          </div>
        </div>
      )}

      {/* Contextual move prompt: what's coming, and when it's time. */}
      {hud.move && hud.live && (
        <div className={cn("pointer-events-none absolute left-1/2 top-[33%] flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-2 font-display text-lg font-black uppercase text-white transition-all", hud.urgent ? "scale-110 bg-[#ff7a1a] shadow-[0_0_28px_#ff7a1a]" : "bg-black/50")} aria-live="polite">
          {hud.move === "slide" || hud.move === "roll" ? <ArrowDown className="size-5" aria-hidden /> : hud.move === "grab" ? <Hand className="size-5" aria-hidden /> : hud.move === "climb" ? <MoveUp className="size-5" aria-hidden /> : <ArrowUp className="size-5" aria-hidden />}
          {MOVE_LABEL[hud.move]}
          {hud.steer !== 0 && <span className="ml-1 flex items-center rounded-full bg-white/20 px-2 text-sm">or {hud.steer < 0 && <ChevronLeft className="size-4" aria-hidden />}steer{hud.steer > 0 && <ChevronRight className="size-4" aria-hidden />}</span>}
        </div>
      )}

      {hud.live && (
        <div className="pointer-events-none absolute bottom-safe left-1/2 w-32 -translate-x-1/2 sm:w-56" aria-hidden>
          <div className="h-2 overflow-hidden rounded-full bg-black/50"><div className="h-full rounded-full bg-gradient-to-r from-[#3ef0ff] to-[#ff3fb4] transition-[width] duration-100" style={{ width: `${hud.speed * 100}%` }} /></div>
        </div>
      )}

      {/* Touch controls: steering on one side, moves on the other (swapped for left-handers). */}
      {phase === "ready" && !over && touch && (
        <>
          <div
            className={cn("absolute bottom-safe flex h-[calc(var(--ctl,1)*clamp(4.25rem,18vmin,7rem))] w-[calc(var(--ctl,1)*clamp(9rem,38vmin,15rem))] items-center justify-between rounded-full border-2 border-white/30 bg-black/30 px-2 text-white backdrop-blur-sm", left ? "right-safe" : "left-safe")}
            onPointerDown={onSteerDown} onPointerMove={onSteerMove} onPointerUp={onSteerUp} onPointerCancel={onSteerUp}
            role="group" aria-label="Steer: touch left or right, or drag"
          >
            <ChevronLeft className="size-9" aria-hidden />
            <span className="flex gap-1.5" aria-hidden>
              {[0, 1, 2].map((l) => <span key={l} className={cn("size-2.5 rounded-full", l === hud.lane ? "bg-white" : "bg-white/30")} />)}
            </span>
            <ChevronRight className="size-9" aria-hidden />
          </div>
          <div className={cn("absolute bottom-safe flex items-end gap-3", left ? "left-safe flex-row-reverse" : "right-safe")}>
            <button type="button" onPointerDown={btnDown("S")} onPointerUp={btnUp("S")} onPointerCancel={btnUp("S")} onLostPointerCapture={btnUp("S")}
              className={cn("ctl-lg flex flex-col items-center justify-center rounded-full border-2 font-display text-sm font-black uppercase text-white transition-transform", pressed.slide ? "scale-95 border-white bg-[#3ef0ff]/80" : slideHot ? "border-white bg-[#3ef0ff]/70 shadow-[0_0_24px_#3ef0ff]" : "border-white/35 bg-white/15")}
              aria-label={slideLabel}>
              {slideLabel === "Roll" ? <RotateCcw className="size-7" aria-hidden /> : <ArrowDown className="size-7" aria-hidden />}
              {slideLabel}
            </button>
            <button type="button" onPointerDown={btnDown("J")} onPointerUp={btnUp("J")} onPointerCancel={btnUp("J")}
              className={cn("ctl-xl mb-[calc(var(--ctl,1)*1.5rem)] flex flex-col items-center justify-center rounded-full border-2 font-display text-lg font-black uppercase text-white shadow-lg transition-transform", pressed.act ? "scale-95 border-white bg-[#ff7a1a]" : actHot ? "border-white bg-[#ff7a1a] shadow-[0_0_28px_#ff7a1a]" : "border-white/40 bg-[#ff7a1a]/75")}
              aria-label={actLabel}>
              {actLabel === "Grab" ? <Hand className="size-8" aria-hidden /> : actLabel === "Climb" ? <MoveUp className="size-8" aria-hidden /> : <ArrowUp className="size-8" aria-hidden />}
              {actLabel}
            </button>
          </div>
          {!hud.live && <p className="pointer-events-none absolute inset-x-0 top-[44%] text-center text-sm font-bold text-white drop-shadow">Steer with your {left ? "right" : "left"} thumb · moves with your {left ? "left" : "right"} thumb · or swipe</p>}
        </>
      )}
      {phase === "ready" && !over && !touch && (
        <div className="pointer-events-none absolute bottom-6 left-safe hidden rounded-xl bg-black/55 px-3 py-2 text-xs text-white/85 sm:block">
          Steer <b>←/→</b> or <b>A/D</b> · Jump / vault / climb / grab <b>Space</b> or <b>W</b> · Slide <b>↓</b>/<b>S</b> (in the air: roll)
        </div>
      )}

      <RotateHint />
      {over && <div className="absolute inset-0 z-30 flex items-center justify-center overflow-y-auto bg-black/50 p-4">{renderEnd(over)}</div>}
    </div>
  );
}
