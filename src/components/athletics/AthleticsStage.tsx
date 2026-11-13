import { ChevronLeft, ChevronRight, Loader2, Monitor, Smartphone, Volume2, VolumeX } from "lucide-react";
import { ControlsHelpButton } from "@/components/game/ControlsGuide";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { StadiumAudio } from "@/game/athletics/audio";
import type { AthleticsDriver } from "@/game/athletics/driver";
import type { AthleticsView, Quality } from "@/game/athletics/renderer";
import { EVENTS, placings, type EventId, type EventState, type Key } from "@/game/athletics/sim";
import type { AvatarConfig } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { useTouchMode } from "@/lib/input-mode";
import { FullscreenButton } from "@/components/game/FullscreenButton";
import { ctlStyle, GameSettingsButton, RotateHint, useGameSurface } from "@/components/game/GameSurface";
import { useGameSettings } from "@/lib/game-settings";

interface Props {
  event: EventId;
  driver: AthleticsDriver;
  names: string[];
  avatars: (AvatarConfig | null)[];
  /** Called once, shortly after the event is over. */
  onEventEnd: (s: EventState) => void;
  topRight?: ReactNode;
  /** Optional overlay (e.g. standings between events). */
  overlay?: ReactNode;
}

export function markText(event: EventId, v: number | null) {
  if (v === null) return EVENTS[event].kind === "race" ? "DNF" : "NM";
  return EVENTS[event].kind === "race" ? `${v.toFixed(2)} s` : `${v.toFixed(2)} m`;
}

const ORD = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

export function AthleticsStage({ event, driver, names, avatars, onEventEnd, topRight, overlay }: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useGameSurface(surfaceRef);
  const [settings] = useGameSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<AthleticsView | null>(null);
  const audioRef = useRef<StadiumAudio | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [quality, setQuality] = useState<Quality>("high");
  const [sound, setSound] = useState(true);
  const touch = useTouchMode();
  const [hud, setHud] = useState({ toLine: 0, prompt: "L" as "L" | "R", speed: 0, call: "", aiming: false, angle: 0, attempt: 0, time: 0, best: null as number | null, live: false, flash: 0 });
  const [banner, setBanner] = useState<{ text: string; sub?: string; tone: "good" | "bad" | "info"; id: number } | null>(null);
  const [standings, setStandings] = useState<{ i: number; mark: number | null }[]>([]);
  const ended = useRef(false);
  const namesRef = useRef(names);
  namesRef.current = names;
  const onEndRef = useRef(onEventEnd);
  onEndRef.current = onEventEnd;
  const held = useRef(new Set<string>());


  // 3D view (one per stage; events switch inside it).
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { createAthleticsView, detectQuality } = await import("@/game/athletics/renderer");
        const q = detectQuality();
        if (!canvasRef.current || disposed) return;
        const view = await createAthleticsView(canvasRef.current, q);
        if (disposed) return view.destroy();
        viewRef.current = view;
        setQuality(q);
        setPhase("ready");
      } catch (e) {
        console.error("[athletics] failed to start 3D view", e);
        setPhase("error");
      }
    })();
    audioRef.current = new StadiumAudio();
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.enabled = sound;
    if (!sound) audioRef.current?.hush();
  }, [sound]);

  // New event: set up athletes, board and reset the end flag.
  useEffect(() => {
    if (phase !== "ready") return;
    const v = viewRef.current!;
    v.setEvent(event, names.length);
    v.setAthletes(avatars.map((a, i) => ({ avatar: a, bib: String(i + 1) })));
    v.setBoard(EVENTS[event].name, names.map((n, i) => `${i + 1}  ${n}`));
    ended.current = false;
    setBanner(null);
  }, [phase, event, driver, names, avatars]);

  const press = (key: Key, down: boolean) => {
    audioRef.current?.unlock();
    driver.press(key, down);
  };

  // Keyboard.
  useEffect(() => {
    const map = (k: string): Key | null => {
      const u = k.length === 1 ? k.toLowerCase() : k;
      if (u === "ArrowLeft" || u === "a" || u === "z") return "L";
      if (u === "ArrowRight" || u === "d" || u === "x") return "R";
      if (u === " " || u === "ArrowUp" || u === "w" || u === "Enter") return "A";
      return null;
    };
    const down = (e: KeyboardEvent) => {
      const k = map(e.key);
      if (!k) return;
      e.preventDefault();
      if (e.repeat || held.current.has(e.key)) return;
      held.current.add(e.key);
      press(k, true);
    };
    const up = (e: KeyboardEvent) => {
      const k = map(e.key);
      if (!k) return;
      held.current.delete(e.key);
      if (k === "A") press("A", false);
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
    let raf = 0, last = performance.now(), hudAt = 0;
    let said = "", endTimer: ReturnType<typeof setTimeout> | null = null;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const events = driver.update(dt);
      const s = driver.state();
      if (!s) return;
      const v = driver.viewer;
      const audio = audioRef.current;
      const nm = namesRef.current;
      const race = EVENTS[s.event].kind === "race";
      // Celebrations.
      const order = placings(s);
      const celebrate = s.athletes.map((a, i) => {
        if (race) {
          if (a.finish === null) return 0;
          const p = order.indexOf(i);
          return p === 0 ? 1 : p < 3 ? 0.5 : s.phase === "over" && p === s.athletes.length - 1 ? -1 : 0;
        }
        const lastMark = a.marks[a.marks.length - 1];
        if (a.phase !== "done" || lastMark === undefined) return 0;
        if (lastMark === null) return -1;
        return lastMark >= (a.finish ?? 0) ? 0.5 : 0;
      });
      viewRef.current?.setState(s, v, celebrate);

      // Announcer before the gun.
      if (s.phase === "ready") {
        const left = s.goAt - s.t;
        const call = race ? (left > 1.6 ? "On your marks" : "Set") : s.athletes[v]!.attempt === 0 ? `Attempt 1` : `Attempt ${s.athletes[v]!.attempt + 1}`;
        if (call !== said) {
          said = call;
          if (race) audio?.say(call);
          audio?.crowdLevel(race ? 0.05 : 0.15, 0.8);
        }
      }
      for (const e of events) {
        const mine = e.a === v;
        switch (e.kind) {
          case "gun":
            if (race) {
              audio?.gun();
              audio?.crowdLevel(0.7, 0.4);
            }
            setBanner({ text: race ? "GO!" : "GO", tone: "info", id: now });
            break;
          case "false_start":
            if (mine) setBanner({ text: "False start!", sub: "Wait for the gun", tone: "bad", id: now });
            break;
          case "step":
            if (mine) audio?.step(1);
            break;
          case "wrong":
            if (mine) audio?.wrong();
            break;
          case "hurdle_hit":
            if (mine) audio?.hurdle();
            break;
          case "takeoff":
            if (mine && s.event === "longjump" && e.detail !== "start") audio?.crowdLevel(0.6, 0.3);
            break;
          case "throw":
            if (mine && e.detail !== "start") {
              audio?.whoosh();
              audio?.crowdLevel(0.55, 0.4);
            }
            break;
          case "land":
            if (s.event === "longjump") audio?.sand();
            if (s.event === "javelin") audio?.thud();
            if (mine && e.detail) {
              const m = Number(e.detail);
              const me = s.athletes[v]!;
              const early = me.takeoffX < -1.5;
              const pb = m > 0 && m >= (me.finish ?? 0);
              setBanner({ text: `${m.toFixed(2)} m`, sub: early ? (s.event === "longjump" ? `Took off ${(-me.takeoffX).toFixed(1)} m before the board` : "Released too far behind the line") : pb ? "Best mark!" : undefined, tone: early ? "info" : "good", id: now });
              audio?.say(`${m.toFixed(2)} metres`);
              if (pb) audio?.roar(1.6);
              viewRef.current?.cheer(pb ? 0.8 : 0.4);
            }
            break;
          case "foul":
            if (mine) {
              setBanner({ text: "FOUL", sub: s.event === "longjump" ? "Over the board" : "Over the line", tone: "bad", id: now });
              audio?.say("Foul");
              audio?.crowdLevel(0.3, 0.5);
            }
            break;
          case "finish": {
            const place = s.order.indexOf(e.a ?? -1);
            if (place === 0) {
              audio?.roar(3);
              viewRef.current?.cheer(1);
              audio?.say(`${nm[e.a ?? 0] ?? "Lane " + ((e.a ?? 0) + 1)} wins in ${Number(e.detail).toFixed(2)}`);
            }
            if (mine) setBanner({ text: `${Number(e.detail).toFixed(2)} s`, sub: `${ORD[place] ?? `${place + 1}th`} place`, tone: place === 0 ? "good" : "info", id: now });
            break;
          }
          case "done":
            if (!ended.current) {
              ended.current = true;
              endTimer = setTimeout(() => onEndRef.current(s), race ? 2600 : 2200);
            }
            break;
          default:
            break;
        }
      }
      if (now - hudAt > 50) {
        hudAt = now;
        const me = s.athletes[v]!;
        setHud({
          toLine: -me.x,
          prompt: me.prompt, speed: me.v / 12.2,
          call: s.phase === "ready" ? (race ? (s.goAt - s.t > 1.6 ? "On your marks" : "Set…") : `Attempt ${Math.min(EVENTS[s.event].attempts, me.attempt + 1)} of ${EVENTS[s.event].attempts}`) : "",
          aiming: me.phase === "aiming", angle: me.phase === "aiming" ? Math.min(s.event === "longjump" ? 50 : 60, (s.t - me.actionAt) * (s.event === "longjump" ? 70 : 75)) : me.angle,
          attempt: me.attempt, time: race && s.phase !== "ready" ? (me.finish ?? Math.max(0, s.t - s.goAt)) : 0, best: me.finish, live: s.phase === "live" && me.phase !== "done", flash: 0,
        });
        setStandings(order.map((i) => ({ i, mark: s.athletes[i]!.finish })));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (endTimer) clearTimeout(endTimer);
    };
  }, [phase, driver]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 1800);
    return () => clearTimeout(t);
  }, [banner]);

  const pad = (key: Key) => ({
    onPointerDown: (e: RPointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      press(key, true);
    },
    onPointerUp: () => key === "A" && press("A", false),
    onPointerCancel: () => key === "A" && press("A", false),
  });

  const ev = EVENTS[event];
  const field = ev.kind === "field";
  const ideal = event === "longjump" ? 45 : 36;
  const maxA = event === "longjump" ? 50 : 60;
  return (
    <div ref={surfaceRef} style={ctlStyle(settings)} className="game-surface relative h-dvh w-full touch-none select-none overflow-hidden bg-black">
      <RotateHint />
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`3D athletics stadium: ${ev.name}`} />
      {phase === "loading" && <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white"><Loader2 className="mr-2 size-6 animate-spin" aria-hidden /> Filling the stadium…</div>}
      {phase === "error" && <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-white">Your browser couldn't start the 3D view. Try updating your browser or enabling hardware acceleration.</div>}

      {/* Event header */}
      <div className="pointer-events-none absolute left-3 top-3 pt-safe text-white">
        <div className="glass rounded-xl px-4 py-2">
          <p className="font-display text-2xl font-black uppercase leading-none">{ev.name}</p>
          <p className="text-sm tabular-nums text-white/80">
            {field ? `Attempt ${Math.min(ev.attempts, hud.attempt + (hud.live ? 1 : 0)) || 1}/${ev.attempts} · Best ${markText(event, hud.best)}` : hud.time ? `${hud.time.toFixed(2)} s` : "Waiting for the gun"}
          </p>
        </div>
        <ol className="glass mt-2 hidden w-56 rounded-xl px-3 py-2 text-sm sm:block" aria-label="Standings">
          {standings.slice(0, 8).map((r, k) => (
            <li key={r.i} className={cn("flex justify-between gap-2 tabular-nums", r.i === driver.viewer && "font-bold text-[#ffd23f]")}>
              <span className="truncate">{k + 1}. {names[r.i]}</span>
              <span>{r.mark === null ? "—" : field ? r.mark.toFixed(2) : r.mark.toFixed(2)}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="absolute right-3 top-3 flex max-w-[62vw] flex-wrap justify-end gap-2 pt-safe">
        <button type="button" onClick={() => setSound((v) => !v)} className="glass rounded-full p-2 text-white" aria-label={sound ? "Mute sound" : "Unmute sound"}>{sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}</button>
        <button type="button" onClick={() => { const q = quality === "high" ? "low" : "high"; setQuality(q); viewRef.current?.setQuality(q); }} className="glass rounded-full p-2 text-white" aria-label={`Graphics: ${quality}. Switch.`}>{quality === "high" ? <Monitor className="size-5" /> : <Smartphone className="size-5" />}</button>
        <ControlsHelpButton sport="athletics" events={[event]} />
        <FullscreenButton />
        {topRight}
      </div>

      {hud.call && <div className="pointer-events-none absolute inset-x-0 top-[22%] text-center font-display text-4xl font-black uppercase text-white drop-shadow-lg sm:text-6xl" aria-live="assertive">{hud.call}</div>}
      {banner && (
        <div key={banner.id} className="pointer-events-none absolute inset-x-0 top-[30%] flex flex-col items-center" aria-live="assertive">
          <span className={cn("animate-rise rounded-2xl px-6 py-1 font-display text-5xl font-black uppercase italic text-white shadow-xl sm:text-7xl",
            banner.tone === "good" ? "bg-[#1f9d55]/85" : banner.tone === "bad" ? "bg-[#b4233a]/85" : "bg-black/55")}>{banner.text}</span>
          {banner.sub && <span className="mt-2 rounded-full bg-black/60 px-4 py-1 text-sm font-bold uppercase text-white">{banner.sub}</span>}
        </div>
      )}

      {/* Prompt + speed */}
      {phase === "ready" && hud.live && !hud.aiming && (
        <div data-prompt={hud.prompt} aria-label={hud.prompt === "L" ? "Press left" : "Press right"} className="pointer-events-none absolute inset-x-0 bottom-[30%] flex flex-col items-center gap-2 sm:bottom-[22%]">
          <div className="flex gap-4">
            {(["L", "R"] as const).map((k) => (
              <span key={k} className={cn("flex size-16 items-center justify-center rounded-2xl border-2 font-display text-3xl font-black transition sm:size-20",
                hud.prompt === k ? "scale-110 border-white bg-[#ff7a1a] text-white shadow-[0_0_30px_#ff7a1a]" : "border-white/20 bg-black/40 text-white/40")}>
                {k === "L" ? <ChevronLeft className="size-10" /> : <ChevronRight className="size-10" />}
              </span>
            ))}
          </div>
          {field && hud.toLine > -1 && (
            <span className={cn("rounded-full px-4 py-1 font-display text-lg font-black uppercase tabular-nums", hud.toLine < 2.5 ? "bg-[#2fbf71] text-white" : "bg-black/55 text-white")}>
              {event === "longjump" ? "Board" : "Line"} {Math.max(0, hud.toLine).toFixed(1)} m{hud.toLine < 2.5 ? " — NOW!" : ""}
            </span>
          )}
          <div className="h-3 w-64 overflow-hidden rounded-full bg-black/50" aria-label={`Speed ${Math.round(hud.speed * 100)}%`}>
            <div className="h-full rounded-full bg-gradient-to-r from-[#2fbf71] via-[#ffd23f] to-[#ff2d2d] transition-[width] duration-75" style={{ width: `${Math.min(100, hud.speed * 100)}%` }} />
          </div>
        </div>
      )}
      {/* Angle meter */}
      {hud.aiming && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[30%] flex justify-center sm:bottom-[22%]">
          <svg width="220" height="130" viewBox="0 0 220 130" aria-label={`Angle ${Math.round(hud.angle)} degrees`}>
            <path d="M10 120 A100 100 0 0 1 210 120" fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="22" />
            {(() => {
              const a0 = ((ideal - 5) / 90) * Math.PI, a1 = ((ideal + 5) / 90) * Math.PI;
              const p = (a: number) => `${110 - Math.cos(a) * 100} ${120 - Math.sin(a) * 100}`;
              return <path d={`M${p(a0)} A100 100 0 0 1 ${p(a1)}`} fill="none" stroke="#3dff9a" strokeWidth="22" />;
            })()}
            <line x1="110" y1="120" x2={110 - Math.cos((hud.angle / 90) * Math.PI) * 105} y2={120 - Math.sin((hud.angle / 90) * Math.PI) * 105} stroke="#fff" strokeWidth="5" strokeLinecap="round" />
            <text x="110" y="110" textAnchor="middle" fill="#fff" fontSize="26" fontWeight="800">{Math.round(hud.angle)}°</text>
            <text x="110" y="128" textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="11">release in the green · max {maxA}°</text>
          </svg>
        </div>
      )}

      {/* Controls */}
      {phase === "ready" && (touch ? (
        <>
          <div className="absolute bottom-4 left-4 flex gap-3 pb-safe">
            <button type="button" aria-label="Left" {...pad("L")} className="flex size-20 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white active:bg-white/40"><ChevronLeft className="size-10" /></button>
            <button type="button" aria-label="Right" {...pad("R")} className="flex size-20 items-center justify-center rounded-full border border-white/25 bg-white/15 text-white active:bg-white/40"><ChevronRight className="size-10" /></button>
          </div>
          {event !== "sprint100" && (
            <button type="button" {...pad("A")} className="absolute bottom-4 right-4 size-24 rounded-full bg-[#ff7a1a]/90 font-display text-lg font-black uppercase text-white shadow-lg active:scale-95 pb-safe">
              {event === "hurdles110" ? "Jump" : event === "longjump" ? "Jump" : "Throw"}
            </button>
          )}
        </>
      ) : (
        <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-xl bg-black/55 px-4 py-2 text-center text-xs text-white/85">
          Run: press <b>←</b>/<b>→</b> (or A/D) matching the lit arrow — rhythm beats mashing.
          {event === "hurdles110" && " Jump hurdles: Space."}
          {event === "longjump" && " At the board: hold Space, release in the green."}
          {event === "javelin" && " Before the line: hold Space, release in the green."}
        </div>
      ))}
      {overlay}
    </div>
  );
}
