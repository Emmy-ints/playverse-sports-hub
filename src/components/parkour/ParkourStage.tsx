import { ArrowDown, ArrowUp, Loader2, Monitor, Smartphone, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { ControlsHelpButton } from "@/components/game/ControlsGuide";
import { ParkourAudio } from "@/game/parkour/audio";
import type { ParkourDriver } from "@/game/parkour/driver";
import type { ParkourView, Quality } from "@/game/parkour/renderer";
import { nextObstacle, placings, progress, type Key, type RaceState } from "@/game/parkour/sim";
import type { AvatarConfig } from "@/lib/avatar";
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

export function formatRaceTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return m ? `${m}:${s.toFixed(2).padStart(5, "0")}` : `${s.toFixed(2)}`;
}

export function ParkourStage({ driver, names, avatars, colors, renderEnd, topRight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<ParkourView | null>(null);
  const audioRef = useRef<ParkourAudio | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [quality, setQuality] = useState<Quality>("high");
  const [sound, setSound] = useState(true);
  const touch = useTouchMode();
  const [hud, setHud] = useState({ count: 3, live: false, time: 0, place: 1, combo: 0, speed: 0, prog: [] as number[], next: null as null | { kind: string; dist: number }, sliding: false });
  const [banner, setBanner] = useState<{ text: string; sub?: string; tone: "good" | "bad" | "info" | "gold"; id: number } | null>(null);
  const [over, setOver] = useState<RaceState | null>(null);
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

  // Course and runners.
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
  };

  // Keyboard: jump Space/↑/W, slide ↓/S (hold).
  useEffect(() => {
    const kind = (k: string): Key | null => {
      const u = k.length === 1 ? k.toLowerCase() : k;
      if (u === " " || u === "ArrowUp" || u === "w") return "J";
      if (u === "ArrowDown" || u === "s") return "S";
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
      const k = kind(e.key);
      if (k !== "S") return;
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

      // Countdown beeps.
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
            if (mine) audio?.jump();
            break;
          case "land":
            if (mine) {
              audio?.land(Math.min(1, Number(e.detail ?? 0.5)));
              buzz(10);
            }
            if (e.a !== undefined) view?.fx("land", e.a);
            break;
          case "slide":
            if (mine) audio?.slide();
            break;
          case "climb":
            if (mine) audio?.climb();
            break;
          case "vault":
            break;
          case "perfect":
            if (e.a !== undefined) view?.fx("perfect", e.a);
            if (mine) {
              audio?.perfect();
              buzz([8, 30, 8]);
              setBanner({ text: e.detail === "wall" ? "Wall run!" : e.detail === "pipe" ? "Clean slide!" : e.detail === "gap" ? "Big leap!" : "Perfect vault!", sub: me.combo > 2 ? `${me.combo}× combo` : undefined, tone: "gold", id: now });
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
              setBanner({ text: e.detail === "pipe" ? "Ouch! Slide under" : e.detail === "wall" ? "Jump at walls!" : "Tripped! Jump earlier", tone: "bad", id: now });
            }
            break;
          case "fall":
            if (mine) {
              audio?.fall();
              buzz([40, 40, 80]);
              setBanner({ text: "Missed the jump!", sub: me.failN >= 2 ? "Next time you'll be helped across" : "Jump right at the edge", tone: "bad", id: now });
            }
            break;
          case "respawn":
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
      if (now - hudAt > 60) {
        hudAt = now;
        const n = nextObstacle(s, me);
        setHud({
          count: Math.max(0, Math.ceil(s.goAt - s.t)),
          live: s.phase !== "ready",
          time: s.phase === "ready" ? 0 : me.finish ?? Math.max(0, s.t - s.goAt),
          place: order.indexOf(v) + 1,
          combo: me.combo,
          speed: Math.min(1, (me.vx + me.boost) / 11),
          prog: s.runners.map((_, i) => progress(s, i)),
          next: n && n.dist < 16 && me.state !== "done" ? { kind: n.o.kind, dist: n.dist } : null,
          sliding: me.state === "slide",
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

  // Touch: big zones — left half hold to slide, right half tap to jump; swipes work too.
  const touchStart = useRef(new Map<number, { y: number; zone: "J" | "S"; slid: boolean }>());
  const onZoneDown = (zone: "J" | "S") => (e: RPointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    touchStart.current.set(e.pointerId, { y: e.clientY, zone, slid: zone === "S" });
    if (zone === "J") press("J", true);
    else press("S", true);
  };
  const onZoneMove = (e: RPointerEvent) => {
    const t = touchStart.current.get(e.pointerId);
    if (!t) return;
    // Swipe down on the jump side also slides; swipe up on the slide side jumps.
    if (t.zone === "J" && !t.slid && e.clientY - t.y > 40) {
      t.slid = true;
      press("S", true);
    } else if (t.zone === "S" && t.y - e.clientY > 40) {
      t.y = -1e9;
      press("S", false);
      press("J", true);
    }
  };
  const onZoneUp = (e: RPointerEvent) => {
    const t = touchStart.current.get(e.pointerId);
    touchStart.current.delete(e.pointerId);
    if (t?.slid) press("S", false);
  };

  const nextLabel = hud.next ? (hud.next.kind === "pipe" ? { t: "Slide", icon: <ArrowDown className="size-5" aria-hidden /> } : hud.next.kind === "wall" ? { t: "Jump & climb", icon: <ArrowUp className="size-5" aria-hidden /> } : hud.next.kind === "gap" ? { t: "Jump the gap", icon: <ArrowUp className="size-5" aria-hidden /> } : { t: "Jump", icon: <ArrowUp className="size-5" aria-hidden /> }) : null;
  const urgent = hud.next ? hud.next.dist < (hud.next.kind === "gap" ? 3.5 : 4) : false;

  return (
    <div className="relative h-dvh w-full touch-none select-none overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label="3D rooftop parkour race" />
      {phase === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white"><Loader2 className="mr-2 size-6 animate-spin" aria-hidden /> Building the city…</div>}
      {phase === "error" && <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-white">Your browser couldn't start the 3D view. Try updating your browser or enabling hardware acceleration.</div>}

      {/* Touch zones sit under the HUD so buttons on top still work. */}
      {phase === "ready" && touch && !over && (
        <div className="absolute inset-0 flex">
          <div className="h-full w-1/2" onPointerDown={onZoneDown("S")} onPointerMove={onZoneMove} onPointerUp={onZoneUp} onPointerCancel={onZoneUp} aria-label="Slide: hold the left side of the screen" />
          <div className="h-full w-1/2" onPointerDown={onZoneDown("J")} onPointerMove={onZoneMove} onPointerUp={onZoneUp} onPointerCancel={onZoneUp} aria-label="Jump: tap the right side of the screen" />
        </div>
      )}

      {/* Top-left: place, time, combo. */}
      <div className="pointer-events-none absolute left-3 top-3 pt-safe text-white">
        <div className="glass rounded-xl px-3 py-2 sm:px-4">
          <p className="font-display text-3xl font-black uppercase leading-none sm:text-4xl">{ORD[hud.place - 1] ?? hud.place}<span className="text-base text-white/60">/{names.length}</span></p>
          <p className="text-sm tabular-nums text-white/85">{hud.live ? formatRaceTime(hud.time) : "Get ready"}</p>
        </div>
        {hud.combo >= 2 && <p className="mt-2 w-fit rounded-full bg-[#ffd23f] px-3 py-0.5 text-xs font-black uppercase text-black">{hud.combo}× combo</p>}
      </div>

      <div className="absolute right-3 top-3 flex gap-2 pt-safe">
        <button type="button" onClick={() => setSound((v) => !v)} className="glass rounded-full p-2 text-white" aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}</button>
        <button type="button" onClick={() => { const q = quality === "high" ? "low" : "high"; setQuality(q); viewRef.current?.setQuality(q); }} className="glass rounded-full p-2 text-white" aria-label={`Graphics: ${quality}. Switch.`}>{quality === "high" ? <Monitor className="size-5" /> : <Smartphone className="size-5" />}</button>
        <ControlsHelpButton sport="parkour" />
        {topRight}
      </div>

      {/* Course progress. */}
      {hud.prog.length > 0 && (
        <div className="pointer-events-none absolute left-1/2 top-[calc(var(--safe-top)+4.6rem)] w-[min(70vw,520px)] -translate-x-1/2 sm:top-4" aria-hidden>
          <div className="relative h-2 rounded-full bg-black/45">
            <div className="absolute right-0 top-1/2 h-4 w-1 -translate-y-1/2 bg-white" />
            {hud.prog.map((p, i) => (
              <span key={i} className={cn("absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/60", i === driver.viewer ? "z-10 size-4" : "size-3")} style={{ left: `${p * 100}%`, background: colors[i] }} />
            ))}
          </div>
        </div>
      )}

      {/* Countdown. */}
      {phase === "ready" && !hud.live && hud.count > 0 && (
        <div key={hud.count} className="pointer-events-none absolute inset-x-0 top-[30%] text-center font-display text-8xl font-black text-white drop-shadow-[0_6px_24px_rgba(0,0,0,0.7)] animate-rise" aria-live="assertive">{hud.count}</div>
      )}
      {banner && (
        <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[24%] flex justify-center px-4" aria-live="assertive">
          <div className={cn("animate-rise rounded-2xl px-5 py-2 text-center text-white shadow-xl",
            banner.tone === "gold" ? "bg-gradient-to-r from-[#ff7a1a] to-[#ffd23f] text-black" : banner.tone === "bad" ? "bg-[#b4233a]/90" : "bg-black/60")}>
            <p className="font-display text-3xl font-black uppercase sm:text-5xl">{banner.text}</p>
            {banner.sub && <p className="text-sm font-bold opacity-85">{banner.sub}</p>}
          </div>
        </div>
      )}

      {/* What's next — helps new players read the course. */}
      {nextLabel && hud.live && (
        <div className={cn("pointer-events-none absolute left-1/2 top-[40%] flex -translate-x-1/2 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-black uppercase text-white transition-colors sm:top-[38%]", urgent ? "bg-[#ff7a1a] shadow-[0_0_24px_#ff7a1a]" : "bg-black/45")}>
          {nextLabel.icon} {nextLabel.t}
        </div>
      )}

      {/* Speed meter. */}
      {hud.live && (
        <div className="pointer-events-none absolute bottom-[calc(var(--safe-bottom,0px)+1rem)] left-1/2 w-40 -translate-x-1/2 sm:w-56" aria-hidden>
          <div className="h-2 overflow-hidden rounded-full bg-black/50"><div className="h-full rounded-full bg-gradient-to-r from-[#3ef0ff] to-[#ff3fb4] transition-[width] duration-100" style={{ width: `${hud.speed * 100}%` }} /></div>
        </div>
      )}

      {/* Controls. */}
      {phase === "ready" && !over && (touch ? (
        <>
          <div className={cn("pointer-events-none absolute bottom-4 left-4 flex size-24 flex-col items-center justify-center rounded-full border-2 font-display text-base font-black uppercase text-white pb-safe", hud.sliding ? "border-white bg-[#3ef0ff]/70" : "border-white/30 bg-white/15")}>
            <ArrowDown className="size-7" aria-hidden /> Slide
          </div>
          <div className="pointer-events-none absolute bottom-4 right-4 flex size-28 flex-col items-center justify-center rounded-full border-2 border-white/40 bg-[#ff7a1a]/85 font-display text-lg font-black uppercase text-white shadow-lg pb-safe">
            <ArrowUp className="size-8" aria-hidden /> Jump
          </div>
          {!hud.live && <p className="pointer-events-none absolute inset-x-0 bottom-36 text-center text-sm font-bold text-white drop-shadow">Tap right side to jump · hold left side to slide</p>}
        </>
      ) : (
        <div className="pointer-events-none absolute bottom-6 left-4 hidden rounded-xl bg-black/55 px-3 py-2 text-xs text-white/85 sm:block">
          Jump: <b>Space</b> / <b>↑</b> · Slide: hold <b>↓</b> / <b>S</b> · In the air, <b>↓</b> drops fast
        </div>
      ))}

      {over && <div className="absolute inset-0 flex items-center justify-center overflow-y-auto bg-black/50 p-4">{renderEnd(over)}</div>}
    </div>
  );
}
