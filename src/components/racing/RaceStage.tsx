import { ChevronLeft, ChevronRight, Loader2, Monitor, RotateCcw, Smartphone, Video, Volume2, VolumeX } from "lucide-react";
import { ControlsHelpButton } from "@/components/game/ControlsGuide";
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { RaceAudio } from "@/game/racing/audio";
import type { RaceDriver } from "@/game/racing/driver";
import type { Quality, RaceView } from "@/game/racing/renderer";
import { standings, type RaceState } from "@/game/racing/sim";
import { buildTrack, type TrackDef } from "@/game/racing/track";
import { cn } from "@/lib/utils";
import { useTouchMode } from "@/lib/input-mode";
import { FullscreenButton } from "@/components/game/FullscreenButton";
import { ctlStyle, GameSettingsButton, RotateHint, useGameSurface } from "@/components/game/GameSurface";
import { getGameSettings, setGameSettings, useGameSettings } from "@/lib/game-settings";

export interface RaceResultRow { car: number; name: string; time: number | null; best: number; color: string }

interface Props {
  track: TrackDef["id"];
  driver: RaceDriver;
  names: string[];
  colors: string[];
  helmets: string[];
  renderEnd: (r: { rows: RaceResultRow[]; final: boolean; viewer: number }) => ReactNode;
  topRight?: ReactNode;
}

export function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, "0")}`;
}

function rowsOf(s: RaceState, names: string[], colors: string[]): RaceResultRow[] {
  return standings(s).map((i) => ({ car: i, name: names[i] ?? `Car ${i + 1}`, time: s.cars[i]!.finished ? s.cars[i]!.finishTime : null, best: s.cars[i]!.bestLap, color: colors[i] ?? "#fff" }));
}

export function RaceStage({ track: trackId, driver, names, colors, helmets, renderEnd, topRight }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useGameSurface(surfaceRef);
  const [settings] = useGameSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<RaceView | null>(null);
  const audioRef = useRef<RaceAudio | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [quality, setQuality] = useState<Quality>("high");
  const [sound, setSound] = useState(true);
  const touch = useTouchMode();
  const [autoGas, setAutoGas] = useState(false);
  const [hud, setHud] = useState({ pos: 1, of: names.length, lap: 0, laps: 0, time: 0, speed: 0, best: 0, last: 0, count: -1, wrong: false, stuck: false, finished: false, phase: "countdown" as RaceState["phase"] });
  const [banner, setBanner] = useState<{ text: string; id: number } | null>(null);
  const [end, setEnd] = useState<{ rows: RaceResultRow[]; final: boolean } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [dots, setDots] = useState<{ x: number; y: number; me: boolean; color: string }[]>([]);

  const keys = useRef(new Set<string>());
  const touchIn = useRef({ left: false, right: false, gas: false, brake: false, drift: false });
  const steer = useRef(0);
  /** Analog steering from the wheel or tilt (-1..1), null when not in use. */
  const analog = useRef<number | null>(null);
  const wheelEl = useRef<HTMLDivElement>(null);
  const wheelTouch = useRef<{ id: number; x: number } | null>(null);
  const [tiltState, setTiltState] = useState<"off" | "need-permission" | "on" | "unavailable">("off");
  const tiltZero = useRef<number | null>(null);
  const autoGasRef = useRef(false);
  autoGasRef.current = autoGas;
  const lastLap = useRef(0);

  const track = useMemo(() => buildTrack(trackId), [trackId]);
  // Minimap projection.
  const map = useMemo(() => {
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < track.n; i++) {
      minX = Math.min(minX, track.x[i]!); maxX = Math.max(maxX, track.x[i]!);
      minZ = Math.min(minZ, track.z[i]!); maxZ = Math.max(maxZ, track.z[i]!);
    }
    const size = Math.max(maxX - minX, maxZ - minZ);
    const px = (x: number) => 8 + ((x - minX) / size) * 124;
    const py = (z: number) => 8 + ((z - minZ) / size) * 124;
    let d = "";
    for (let i = 0; i < track.n; i += 4) d += `${i ? "L" : "M"}${px(track.x[i]!).toFixed(1)},${py(track.z[i]!).toFixed(1)}`;
    return { d: d + "Z", px, py, h: 16 + ((maxZ - minZ) / size) * 124 };
  }, [track]);

  // Phones default to auto-gas: one less thumb to worry about.
  useEffect(() => {
    if (touch) setAutoGas(true);
  }, [touch]);

  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { createRaceView, detectQuality } = await import("@/game/racing/renderer");
        const q = detectQuality();
        if (!canvasRef.current || disposed) return;
        const view = await createRaceView(canvasRef.current, trackId, driver.state().cars.length, q);
        if (disposed) return view.destroy();
        view.setViewer(driver.viewer);
        viewRef.current = view;
        setQuality(q);
        setPhase("ready");
      } catch (e) {
        console.error("[racing] failed to start 3D view", e);
        setPhase("error");
      }
    })();
    audioRef.current = new RaceAudio();
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [trackId, driver]);

  useEffect(() => {
    viewRef.current?.setCars(colors.map((c, i) => ({ color: c, helmet: helmets[i] ?? "#ffffff" })));
  }, [colors, helmets, phase]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.enabled = sound;
    if (!sound) audioRef.current?.silence();
  }, [sound]);

  // Keyboard.
  useEffect(() => {
    const norm = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const down = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      keys.current.add(norm(e));
      audioRef.current?.unlock();
      if (norm(e) === "r" && !e.repeat) driver.reset();
      if (norm(e) === "c" && !e.repeat) {
        const order = ["chase", "close", "bonnet", "cockpit"] as const;
        const cur = getGameSettings().raceView;
        setGameSettings({ raceView: order[(order.indexOf(cur) + 1) % order.length]! });
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(norm(e));
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [driver]);

  // Game loop.
  useEffect(() => {
    if (phase !== "ready") return;
    let raf = 0, last = performance.now(), hudAt = 0, lastCount = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const K = keys.current, T = touchIn.current;
      const left = K.has("ArrowLeft") || K.has("a") || T.left;
      const right = K.has("ArrowRight") || K.has("d") || T.right;
      const digital = (right ? 1 : 0) - (left ? 1 : 0);
      if (analog.current !== null && digital === 0) {
        // Wheel / tilt: follow the thumb closely (a touch of smoothing removes jitter).
        steer.current += (analog.current - steer.current) * (1 - Math.exp(-dt * 18));
      } else {
        // Keys and buttons ramp in and recentre quickly, like a real wheel.
        const target = digital;
        const rate = target === 0 ? 7 : Math.sign(target) !== Math.sign(steer.current) ? 9 : 3.2;
        steer.current += Math.max(-rate * dt, Math.min(rate * dt, target - steer.current));
      }
      if (wheelEl.current) wheelEl.current.style.transform = `rotate(${steer.current * 110}deg)`;
      const brake = K.has("ArrowDown") || K.has("s") || T.brake ? 1 : 0;
      const gas = K.has("ArrowUp") || K.has("w") || T.gas || (autoGasRef.current && !brake) ? 1 : 0;
      driver.input({ steer: steer.current, throttle: gas, brake, handbrake: K.has(" ") || T.drift });
      const events = driver.update(dt);
      const s = driver.state();
      viewRef.current?.setState(s);
      const v = driver.viewer;
      const me = s.cars[v]!;
      const speed = Math.hypot(me.vx, me.vz);
      const audio = audioRef.current;
      if (s.phase === "racing" && !me.finished) audio?.update(speed, gas, me.drift);
      else audio?.silence();
      // Start lights.
      const count = s.phase === "countdown" ? Math.ceil(s.startAt - s.t) : -1;
      if (count !== lastCount) {
        if (count > 0 && count <= 3) audio?.beep(false);
        lastCount = count;
      }
      for (const e of events) {
        if (e.kind === "start") {
          audio?.beep(true);
          setBanner({ text: "GO!", id: now });
        } else if (e.kind === "impact" && (e.car === v || s.t - me.hit < 0.05)) {
          audio?.impact(Number(e.detail ?? 5));
        } else if (e.kind === "lap" && e.car === v) {
          const [n, time, best] = (e.detail ?? "").split(":");
          lastLap.current = Number(time);
          const lapNo = Number(n);
          if (lapNo < s.laps) setBanner({ text: `${lapNo + 1 === s.laps ? "Final lap" : `Lap ${lapNo + 1}`} · ${formatTime(Number(time))}${best ? " · best" : ""}`, id: now });
        } else if (e.kind === "finish" && e.car === v) {
          setBanner({ text: `Finished P${e.detail}!`, id: now });
        }
      }
      if (now - hudAt > 100) {
        hudAt = now;
        const order = standings(s);
        const fwd = Math.sin(me.h) * track.tx[me.idx]! - Math.cos(me.h) * track.tz[me.idx]!;
        setHud({
          pos: order.indexOf(v) + 1, of: s.cars.length, lap: Math.max(0, Math.min(s.laps, me.lap + 1)), laps: s.laps,
          time: s.phase === "countdown" ? 0 : me.finished ? me.finishTime : s.t - s.startAt, speed: speed * 3.6, best: me.bestLap, last: lastLap.current,
          count, wrong: s.phase === "racing" && fwd < -0.3 && speed > 3, stuck: me.stuck > 2 && s.phase === "racing" && !me.finished, finished: me.finished, phase: s.phase,
        });
        setDots(s.cars.map((c, i) => ({ x: map.px(c.x), y: map.py(c.z), me: i === v, color: colors[i] ?? "#fff" })));
        setStatus(driver.status());
        if (me.finished || s.phase === "finished") setEnd({ rows: rowsOf(s, names, colors), final: s.phase === "finished" });
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, driver, track, map, names, colors]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 1800);
    return () => clearTimeout(t);
  }, [banner]);

  const hold = (k: keyof typeof touchIn.current) => ({
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      touchIn.current[k] = true;
      audioRef.current?.unlock();
    },
    onPointerUp: () => (touchIn.current[k] = false),
    onPointerCancel: () => (touchIn.current[k] = false),
    onPointerLeave: () => (touchIn.current[k] = false),
  });

  // Tilt steering (phone as a wheel), from gravity so it works the same on Android and iPhone.
  useEffect(() => {
    if (settings.steering !== "tilt" || !touch) {
      if (settings.steering !== "tilt") analog.current = null;
      setTiltState("off");
      return;
    }
    const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    if (!DM) {
      setTiltState("unavailable");
      return;
    }
    if (typeof DM.requestPermission === "function" && tiltState !== "on") {
      setTiltState("need-permission");
      return;
    }
    setTiltState("on");
    tiltZero.current = null;
    const on = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null) return;
      const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
      // In landscape the screen's horizontal axis is the device's y axis.
      let raw = angle === 90 ? -(g.y ?? 0) : angle === 270 || angle === -90 ? (g.y ?? 0) : (g.x ?? 0);
      if (getGameSettings().tiltInvert) raw = -raw;
      if (tiltZero.current === null) tiltZero.current = raw;
      const range = 5.5 - getGameSettings().camSensitivity * 2.5; // m/s² of tilt for full lock
      analog.current = Math.max(-1, Math.min(1, (raw - tiltZero.current) / range));
    };
    window.addEventListener("devicemotion", on);
    return () => {
      window.removeEventListener("devicemotion", on);
      analog.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.steering, touch, tiltState === "on"]);
  const enableTilt = async () => {
    const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent;
    try {
      const r = await DM?.requestPermission?.();
      setTiltState(r === "granted" ? "on" : "unavailable");
    } catch {
      setTiltState("unavailable");
    }
  };

  // Virtual steering wheel: drag sideways; lets go → recentres.
  const wheelRange = () => (95 - getGameSettings().camSensitivity * 45) * getGameSettings().buttonScale;
  const onWheelDown = (e: RPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    wheelTouch.current = { id: e.pointerId, x: e.clientX };
    analog.current = 0;
    audioRef.current?.unlock();
  };
  const onWheelMove = (e: RPointerEvent<HTMLDivElement>) => {
    const w = wheelTouch.current;
    if (!w || w.id !== e.pointerId) return;
    analog.current = Math.max(-1, Math.min(1, (e.clientX - w.x) / wheelRange()));
  };
  const onWheelUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (wheelTouch.current?.id !== e.pointerId) return;
    wheelTouch.current = null;
    analog.current = 0;
    setTimeout(() => {
      if (!wheelTouch.current && settings.steering === "wheel") analog.current = null;
    }, 250);
  };
  const cycleView = () => {
    const order = ["chase", "close", "bonnet", "cockpit"] as const;
    setGameSettings({ raceView: order[(order.indexOf(settings.raceView) + 1) % order.length]! });
  };
  const leftHand = settings.hand === "left";

  return (
    <div ref={surfaceRef} style={ctlStyle(settings)} className="game-surface relative h-dvh w-full touch-none select-none overflow-hidden bg-black">
      <RotateHint />
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`3D race track: ${track.def.name}`} />
      {phase === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white"><Loader2 className="mr-2 size-6 animate-spin" aria-hidden /> Loading the circuit…</div>}
      {phase === "error" && <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-white">Your browser couldn't start the 3D view. Try updating your browser or enabling hardware acceleration.</div>}

      {/* Position, lap and times */}
      <div className="pointer-events-none absolute left-3 top-3 pt-safe text-white">
        <div className="glass flex items-end gap-4 rounded-xl px-4 py-2" role="status" aria-live="polite">
          <div className="font-display leading-none"><span className="text-5xl font-black">P{hud.pos}</span><span className="text-xl text-white/60">/{hud.of}</span></div>
          <div className="font-display text-sm leading-tight">
            <div>LAP <span className="text-xl font-bold">{hud.lap}</span>/{hud.laps}</div>
            <div className="tabular-nums">{formatTime(hud.time)}</div>
          </div>
        </div>
        <div className="mt-1 rounded-lg bg-black/45 px-3 py-1 text-xs tabular-nums text-white/80">
          Last {hud.last ? formatTime(hud.last) : "—"} · Best {hud.best ? formatTime(hud.best) : "—"}
        </div>
        {status && <div className="mt-1 max-w-xs rounded-lg bg-black/60 px-3 py-1 text-xs">{status}</div>}
      </div>

      {/* Speed */}
      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 pt-safe text-center font-display text-white">
        <span className="text-4xl font-black tabular-nums drop-shadow">{Math.round(hud.speed)}</span>
        <span className="ml-1 text-sm text-white/70">km/h</span>
      </div>

      <div className="absolute right-3 top-3 flex flex-col items-end gap-2 pt-safe">
        <div className="flex max-w-[62vw] flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setSound((v) => !v)} className="glass rounded-full p-2 text-white" aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}</button>
          <button type="button" onClick={() => { const q = quality === "high" ? "low" : "high"; setQuality(q); viewRef.current?.setQuality(q); }} className="glass rounded-full p-2 text-white" aria-label={`Graphics: ${quality}. Switch.`}>{quality === "high" ? <Monitor className="size-5" /> : <Smartphone className="size-5" />}</button>
          <button type="button" onClick={() => setAutoGas((v) => !v)} aria-pressed={autoGas} className={cn("glass rounded-full px-3 py-2 text-xs font-bold text-white", autoGas && "ring-2 ring-[#3dff9a]")}>Auto-gas {autoGas ? "on" : "off"}</button>
          <button type="button" onClick={cycleView} className="glass flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold capitalize text-white" aria-label={`Camera: ${settings.raceView}. Switch view.`}><Video className="size-4" aria-hidden />{settings.raceView === "close" ? "Close" : settings.raceView}</button>
          <GameSettingsButton racing />
          <ControlsHelpButton sport="racing" />
          <FullscreenButton landscape />
          {topRight}
        </div>
        <svg width="140" height={map.h} viewBox={`0 0 140 ${map.h}`} className="rounded-xl bg-black/45" aria-hidden>
          <path d={map.d} fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="3" strokeLinejoin="round" />
          <circle cx={map.px(track.x[0]!)} cy={map.py(track.z[0]!)} r="2.5" fill="#fff" />
          {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.me ? 4.5 : 3.2} fill={d.color} stroke={d.me ? "#fff" : "#000"} strokeWidth={d.me ? 1.5 : 0.8} />)}
        </svg>
      </div>

      {hud.count > 0 && hud.phase === "countdown" && (
        <div className="pointer-events-none absolute inset-x-0 top-[28%] flex justify-center gap-3" aria-live="assertive">
          {[3, 2, 1].map((n) => <span key={n} className={cn("size-10 rounded-full border-2 border-white/40 sm:size-14", hud.count <= n ? "bg-[#ff2d2d] shadow-[0_0_24px_#ff2d2d]" : "bg-black/50")} />)}
        </div>
      )}
      {banner && <div key={banner.id} className="pointer-events-none absolute left-1/2 top-[30%] -translate-x-1/2 animate-rise rounded-2xl bg-black/60 px-6 py-2 font-display text-3xl font-black uppercase text-white sm:text-5xl">{banner.text}</div>}
      {hud.wrong && <div className="pointer-events-none absolute left-1/2 top-[45%] -translate-x-1/2 rounded-xl bg-[#b4233a]/85 px-5 py-2 font-display text-2xl font-black uppercase text-white">Wrong way</div>}
      {hud.stuck && (
        <button type="button" onClick={() => driver.reset()} className="absolute left-1/2 top-[55%] -translate-x-1/2 rounded-full bg-[#ff7a1a] px-5 py-2 font-bold text-white shadow-lg">
          <RotateCcw className="mr-1 inline size-4" aria-hidden /> Back on track{!touch && " (R)"}
        </button>
      )}

      {phase === "ready" && !hud.finished && (touch ? (
        <>
          {/* Steering (left thumb; right for left-handers). */}
          <div className={cn("absolute bottom-safe flex items-end gap-3", leftHand ? "right-safe" : "left-safe")}>
            {settings.steering === "wheel" && (
              <div onPointerDown={onWheelDown} onPointerMove={onWheelMove} onPointerUp={onWheelUp} onPointerCancel={onWheelUp}
                className="ctl-xl relative flex items-center justify-center rounded-full border-[6px] border-white/45 bg-black/25 backdrop-blur-sm" role="slider" aria-label="Steering wheel: drag left or right" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={0}>
                <div ref={wheelEl} className="absolute inset-1 rounded-full">
                  <span className="absolute left-1/2 top-0 h-3 w-1.5 -translate-x-1/2 rounded-full bg-[#ff7a1a]" />
                  <span className="absolute inset-x-2 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/50" />
                  <span className="absolute bottom-2 left-1/2 top-1/2 w-1.5 -translate-x-1/2 rounded-full bg-white/50" />
                </div>
              </div>
            )}
            {settings.steering === "buttons" && (
              <>
                <button type="button" aria-label="Steer left" {...hold("left")} className="ctl-lg flex items-center justify-center rounded-full border border-white/20 bg-white/15 text-white active:bg-white/35"><ChevronLeft className="size-10" /></button>
                <button type="button" aria-label="Steer right" {...hold("right")} className="ctl-lg flex items-center justify-center rounded-full border border-white/20 bg-white/15 text-white active:bg-white/35"><ChevronRight className="size-10" /></button>
              </>
            )}
            {settings.steering === "tilt" && (
              <div className="glass rounded-2xl px-3 py-2 text-xs text-white">
                {tiltState === "need-permission" ? (
                  <button type="button" onClick={enableTilt} className="font-bold underline">Tap to allow tilt steering</button>
                ) : tiltState === "unavailable" ? (
                  <span>Tilt isn't available on this device — pick Wheel in settings.</span>
                ) : (
                  <span className="flex items-center gap-2">Tilt to steer
                    <button type="button" className="rounded-full bg-white/20 px-2 py-0.5 font-bold" onClick={() => (tiltZero.current = null)}>Re-centre</button>
                    <button type="button" className="rounded-full bg-white/20 px-2 py-0.5 font-bold" onClick={() => setGameSettings({ tiltInvert: !settings.tiltInvert })}>Invert</button>
                  </span>
                )}
              </div>
            )}
          </div>
          {/* Pedals (right thumb; left for left-handers). Each is its own touch, so steer + gas + drift work together. */}
          <div className={cn("absolute bottom-safe flex items-end gap-3", leftHand ? "left-safe flex-row-reverse" : "right-safe")}>
            <button type="button" {...hold("drift")} className="ctl-sm rounded-full bg-[#8b5cf6]/80 font-display text-xs font-bold uppercase text-white active:scale-95">Drift</button>
            <button type="button" {...hold("brake")} className="ctl-lg rounded-full bg-[#b4233a]/85 font-display text-sm font-bold uppercase text-white active:scale-95">Brake</button>
            {!autoGas && <button type="button" {...hold("gas")} className="ctl-xl rounded-full bg-[#1f9d55]/85 font-display text-lg font-bold uppercase text-white active:scale-95">Gas</button>}
          </div>
        </>
      ) : (
        <div className="pointer-events-none absolute bottom-4 left-safe rounded-xl bg-black/50 px-3 py-2 text-xs text-white/80">
          Drive: W / ↑ · Brake & reverse: S / ↓ · Steer: A D / ← → · Drift: Space · Back on track: R · Camera: C
        </div>
      ))}

      {end && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/45 p-4">{renderEnd({ ...end, viewer: driver.viewer })}</div>
      )}
    </div>
  );
}
