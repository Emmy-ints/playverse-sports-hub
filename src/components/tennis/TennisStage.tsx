import { Loader2, Monitor, Smartphone, Volume2, VolumeX, Zap } from "lucide-react";
import { ControlsHelpButton } from "@/components/game/ControlsGuide";
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { SHOT_KEYS, toFrame, type TennisDriver } from "@/game/tennis/driver";
import type { Quality, TennisView } from "@/game/tennis/renderer";
import { currentServer, pointLabel, type Score } from "@/game/tennis/scoring";
import { aiInput, type PlayerStats, type ShotType } from "@/game/tennis/sim";
import type { CourtTheme } from "@/game/tennis/themes";
import { TennisAudio } from "@/game/tennis/audio";
import type { AvatarConfig } from "@/lib/avatar";
import { cn } from "@/lib/utils";

interface Props {
  theme: CourtTheme;
  driver: TennisDriver;
  names: [string, string];
  avatars: [AvatarConfig | null, AvatarConfig | null];
  /** Rendered over the court when the match ends. */
  renderEnd: (r: { winner: 0 | 1; score: Score; stats: [PlayerStats, PlayerStats] }) => ReactNode;
  topRight?: ReactNode;
}

const SIDE = [1, -1] as const;
const CHARGE_MS = 650;
const SHOTS: ShotType[] = ["topspin", "flat", "lob", "drop"];

/** Umpire-style call with the server's score first. */
function spokenScore(s: Score, names: [string, string]): string {
  const srv = currentServer(s);
  const rcv = srv === 0 ? 1 : 0;
  const a = s.points[srv], b = s.points[rcv];
  if (s.tiebreak) return `${a}–${b}`;
  if (a >= 3 && b >= 3) return a === b ? "Deuce" : `Advantage ${names[a > b ? srv : rcv]}`;
  const word = (n: number) => ["love", "15", "30", "40"][n]!;
  if (a === b) return a === 0 ? "Love all" : `${word(a)} all`;
  return `${word(a)}–${word(b)}`;
}

export function TennisStage({ theme, driver, names, avatars, renderEnd, topRight }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewRef = useRef<TennisView | null>(null);
  const audioRef = useRef<TennisAudio | null>(null);
  const [phase, setPhase] = useState<"loading" | "error" | "ready">("loading");
  const [quality, setQuality] = useState<Quality>("high");
  const [sound, setSound] = useState(true);
  const [assist, setAssist] = useState(true);
  const [score, setScore] = useState<Score>(() => driver.state().score);
  const [banner, setBanner] = useState<{ text: string; tone: "good" | "bad" | "info"; id: number } | null>(null);
  const [meter, setMeter] = useState(0);
  const [charge, setCharge] = useState<{ type: ShotType; p: number } | null>(null);
  const [specialOn, setSpecialOn] = useState(false);
  const [myServe, setMyServe] = useState(false);
  const [ended, setEnded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [touch, setTouch] = useState(false);

  const keys = useRef(new Set<string>());
  const stick = useRef({ x: 0, y: 0, active: false, ox: 0, oy: 0, id: -1 });
  const charging = useRef<{ type: ShotType; start: number } | null>(null);
  const special = useRef(false);
  const assistRef = useRef(true);
  assistRef.current = assist;
  const namesRef = useRef(names);
  namesRef.current = names;

  useEffect(() => {
    setTouch(window.matchMedia?.("(pointer: coarse)").matches ?? false);
  }, []);

  // Boot the 3D view.
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        const { createTennisView, detectQuality } = await import("@/game/tennis/renderer");
        const q = detectQuality();
        if (!canvasRef.current || disposed) return;
        const view = await createTennisView(canvasRef.current, theme, q);
        if (disposed) return view.destroy();
        view.setViewer(driver.viewer);
        viewRef.current = view;
        setQuality(q);
        setPhase("ready");
      } catch (e) {
        console.error("[tennis] failed to start 3D view", e);
        setPhase("error");
      }
    })();
    audioRef.current = new TennisAudio();
    return () => {
      disposed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
      audioRef.current?.dispose();
      audioRef.current = null;
    };
  }, [theme, driver.viewer]);

  useEffect(() => {
    viewRef.current?.setAvatars(avatars);
  }, [avatars, phase]);

  useEffect(() => {
    if (audioRef.current) audioRef.current.enabled = sound;
  }, [sound]);

  // Scoreboard in the stadium.
  useEffect(() => {
    const s = score;
    viewRef.current?.setScoreboard({ names, sets: s.sets, games: s.games, points: [pointLabel(s, 0), pointLabel(s, 1)], server: currentServer(s), history: s.history });
  }, [score, names, phase]);

  const flash = (text: string, tone: "good" | "bad" | "info") => setBanner({ text, tone, id: Date.now() + Math.random() });

  const release = (type: ShotType) => {
    const c = charging.current;
    if (!c || c.type !== type) return;
    charging.current = null;
    setCharge(null);
    const power = Math.min(1, 0.15 + (performance.now() - c.start) / CHARGE_MS);
    const s = driver.state();
    const v = driver.viewer;
    let sx = stick.current.active ? stick.current.x : 0;
    if (keys.current.has("ArrowLeft") || keys.current.has("a")) sx -= 1;
    if (keys.current.has("ArrowRight") || keys.current.has("d")) sx += 1;
    // Aim with left/right at release; otherwise aim away from the opponent.
    const opp = s.players[v === 0 ? 1 : 0];
    const aim = Math.abs(sx) > 0.2 ? Math.max(-1, Math.min(1, sx * SIDE[v])) : opp.x > 0 ? -0.55 : 0.55;
    const useSpecial = special.current && s.players[v].special >= 1;
    if (useSpecial) {
      special.current = false;
      setSpecialOn(false);
    }
    driver.input({ mx: 0, mz: 0, sprint: false, shot: { type, aim, power, special: useSpecial } });
  };
  const press = (type: ShotType) => {
    if (charging.current) return;
    audioRef.current?.unlock(); // first gesture unlocks audio on iOS
    charging.current = { type, start: performance.now() };
  };

  // Keyboard.
  useEffect(() => {
    const shotFor = (k: string): ShotType | null => {
      const u = k.toUpperCase();
      if (u === " " || u === "J") return "topspin";
      if (u === "K") return "flat";
      if (u === "L") return "lob";
      if (u === "U") return "drop";
      return null;
    };
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) e.preventDefault();
      keys.current.add(k);
      const st = shotFor(e.key);
      if (st && !e.repeat) press(st);
      if (k === "e" && !e.repeat) {
        special.current = !special.current;
        setSpecialOn(special.current);
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      keys.current.delete(k);
      const st = shotFor(e.key);
      if (st) release(st);
    };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driver]);

  // Game loop.
  useEffect(() => {
    if (phase !== "ready") return;
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let lastScore = driver.state().score;
    let calloutTimer: ReturnType<typeof setTimeout> | null = null;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const v = driver.viewer;
      const s0 = driver.state();
      // Movement from keys / joystick in screen space → court axes.
      let sx = 0, sy = 0;
      const K = keys.current;
      if (K.has("ArrowLeft") || K.has("a")) sx -= 1;
      if (K.has("ArrowRight") || K.has("d")) sx += 1;
      if (K.has("ArrowUp") || K.has("w")) sy += 1;
      if (K.has("ArrowDown") || K.has("s")) sy -= 1;
      if (stick.current.active) {
        sx += stick.current.x;
        sy += stick.current.y;
      }
      let mx = sx * SIDE[v], mz = -sy * SIDE[v];
      let sprint = K.has("Shift") || Math.hypot(stick.current.x, stick.current.y) > 0.92;
      if (assistRef.current && Math.hypot(sx, sy) < 0.1) {
        const a = aiInput(s0, v, 1);
        mx = a.mx;
        mz = a.mz;
        sprint = a.sprint;
      }
      driver.input({ mx, mz, sprint, shot: null });
      const events = driver.update(dt);
      const s = driver.state();
      viewRef.current?.setFrame(toFrame(s));
      const audio = audioRef.current;
      const nm = namesRef.current;
      for (const e of events) {
        const near = e.player === v ? 1 : 0.4;
        switch (e.kind) {
          case "hit": {
            audio?.hit(e.detail === "serve" ? 0.9 : 0.6, near);
            if (e.detail?.endsWith(":special")) flash("Power shot!", e.player === v ? "good" : "info");
            break;
          }
          case "bounce": {
            const z = Number((e.detail ?? "0,0").split(",")[1]);
            audio?.bounce(Math.sign(z) === SIDE[v] ? 1 : 0.4);
            break;
          }
          case "fault":
            flash("Fault", "info");
            audio?.call("Fault");
            break;
          case "double_fault":
            flash("Double fault", e.player === v ? "bad" : "good");
            audio?.call("Double fault");
            break;
          case "point": {
            const mine = e.player === v;
            const how = e.detail;
            if (how === "ace") { flash("ACE!", mine ? "good" : "bad"); audio?.applause(0.9); viewRef.current?.cheer(1); }
            else if (how === "winner") { flash(mine ? "Winner!" : "Point " + nm[e.player as 0 | 1], mine ? "good" : "bad"); audio?.applause(0.6); viewRef.current?.cheer(0.6); }
            else if (how === "out") { flash("Out", mine ? "good" : "bad"); audio?.call("Out"); audio?.ooh(); viewRef.current?.cheer(0.25); }
            else if (how === "net") { flash("Net", mine ? "good" : "bad"); audio?.ooh(); }
            else if (how !== "double_fault") flash("Point " + nm[e.player as 0 | 1], mine ? "good" : "bad");
            break;
          }
          case "game":
            break;
          default:
            break;
        }
      }
      // Score changes (after events so the spoken call follows the line call).
      const key = (x: Score) => `${x.points}|${x.games}|${x.sets}|${x.tiebreak}|${x.winner}`;
      if (key(s.score) !== key(lastScore)) {
        const prev = lastScore;
        lastScore = s.score;
        setScore(s.score);
        const w = s.score.winner;
        let call: string;
        if (w !== null) call = `Game, set and match, ${nm[w]}`;
        else if (s.score.sets[0] + s.score.sets[1] > prev.sets[0] + prev.sets[1]) call = `Game and set, ${nm[s.score.sets[0] > prev.sets[0] ? 0 : 1]}`;
        else if (s.score.games[0] + s.score.games[1] !== prev.games[0] + prev.games[1] || s.score.tiebreak !== prev.tiebreak) {
          const gw = s.score.games[0] > prev.games[0] ? 0 : 1;
          call = s.score.tiebreak && !prev.tiebreak ? "Tiebreak" : `Game, ${nm[gw]}`;
        } else call = spokenScore(s.score, nm);
        if (calloutTimer) clearTimeout(calloutTimer);
        calloutTimer = setTimeout(() => {
          audio?.call(call);
          if (w === null) flash(call, "info");
        }, 1000);
        if (w !== null) {
          viewRef.current?.cheer(1);
          audio?.applause(1);
          setEnded(true);
        }
      }
      if (now - hudAt > 120) {
        hudAt = now;
        setMeter(s.players[v].special);
        setMyServe(s.phase === "serve" && currentServer(s.score) === v);
        setStatus(driver.status());
        const c = charging.current;
        setCharge(c ? { type: c.type, p: Math.min(1, 0.15 + (now - c.start) / CHARGE_MS) } : null);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      if (calloutTimer) clearTimeout(calloutTimer);
    };
  }, [phase, driver]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner((b) => (b?.id === banner.id ? null : b)), 1400);
    return () => clearTimeout(t);
  }, [banner]);

  // Virtual joystick (left half of the screen).
  const onStickDown = (e: RPointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    stick.current = { x: 0, y: 0, active: true, ox: e.clientX, oy: e.clientY, id: e.pointerId };
  };
  const onStickMove = (e: RPointerEvent<HTMLDivElement>) => {
    const st = stick.current;
    if (!st.active || st.id !== e.pointerId) return;
    const dx = (e.clientX - st.ox) / 55, dy = -(e.clientY - st.oy) / 55;
    const l = Math.hypot(dx, dy);
    st.x = l > 1 ? dx / l : dx;
    st.y = l > 1 ? dy / l : dy;
  };
  const onStickUp = () => {
    stick.current = { ...stick.current, x: 0, y: 0, active: false, id: -1 };
  };

  const s = score;
  const srv = currentServer(s);
  const st = driver.state();
  const hudRow = (p: 0 | 1) => (
    <div className="flex items-center gap-2">
      <span className={cn("size-2 rounded-full", srv === p ? "bg-[#d9f23a]" : "bg-transparent")} aria-label={srv === p ? "Serving" : undefined} />
      <span className="w-24 truncate font-semibold sm:w-32">{names[p]}</span>
      {s.history.map((h, i) => <span key={i} className="w-5 text-center text-white/60">{h[p]}</span>)}
      <span className="w-5 text-center font-bold text-[#ffd23f]">{s.games[p]}</span>
      <span className="w-8 rounded bg-white/10 text-center font-bold text-[#3dff9a]">{pointLabel(s, p)}</span>
    </div>
  );

  return (
    <div className="relative h-dvh w-full touch-none select-none overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" aria-label={`3D tennis court: ${theme.name}`} />

      {phase === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 text-white"><Loader2 className="mr-2 size-6 animate-spin" aria-hidden /> Loading the stadium…</div>
      )}
      {phase === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-white">Your browser couldn't start the 3D view. Try updating your browser or enabling hardware acceleration.</div>
      )}

      {/* Scoreboard */}
      <div className="pointer-events-none absolute left-3 top-3 pt-safe">
        <div className="glass rounded-xl px-3 py-2 font-display text-sm text-white sm:text-base" role="status" aria-live="polite">
          {hudRow(0)}
          {hudRow(1)}
        </div>
        {status && <div className="mt-2 rounded-lg bg-black/60 px-3 py-1 text-xs text-white">{status}</div>}
      </div>

      <div className="absolute right-3 top-3 flex gap-2 pt-safe">
        <button type="button" onClick={() => setSound((v) => !v)} className="glass rounded-full p-2 text-white" aria-label={sound ? "Mute sound" : "Unmute sound"}>
          {sound ? <Volume2 className="size-5" /> : <VolumeX className="size-5" />}
        </button>
        <button type="button" onClick={() => { const q = quality === "high" ? "low" : "high"; setQuality(q); viewRef.current?.setQuality(q); }} className="glass rounded-full p-2 text-white" aria-label={`Graphics: ${quality}. Switch.`}>
          {quality === "high" ? <Monitor className="size-5" /> : <Smartphone className="size-5" />}
        </button>
        <button type="button" onClick={() => setAssist((v) => !v)} aria-pressed={assist} className={cn("glass rounded-full px-3 py-2 text-xs font-bold text-white", assist && "ring-2 ring-[#d9f23a]")}>
          Auto-run {assist ? "on" : "off"}
        </button>
        <ControlsHelpButton sport="tennis" />
        {topRight}
      </div>

      {banner && (
        <div key={banner.id} className={cn("pointer-events-none absolute left-1/2 top-[22%] -translate-x-1/2 animate-rise rounded-2xl px-6 py-2 font-display text-3xl font-black uppercase tracking-wide text-white shadow-xl sm:text-5xl",
          banner.tone === "good" ? "bg-[#1f9d55]/85" : banner.tone === "bad" ? "bg-[#b4233a]/85" : "bg-black/60")}>
          {banner.text}
        </div>
      )}

      {myServe && !ended && (
        <div className="pointer-events-none absolute bottom-[38%] left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-4 py-1 text-sm text-white">
          Your serve — hold a shot button for power, release to serve
        </div>
      )}

      {/* Controls */}
      {!ended && phase === "ready" && (
        <>
          {touch && (
            <div className="absolute bottom-0 left-0 h-[45%] w-1/2" onPointerDown={onStickDown} onPointerMove={onStickMove} onPointerUp={onStickUp} onPointerCancel={onStickUp} aria-label="Movement joystick: drag to move">
              <div className="absolute bottom-10 left-10 size-28 rounded-full border-2 border-white/30 bg-white/5 pb-safe" aria-hidden />
            </div>
          )}
          <div className="absolute bottom-4 right-4 grid grid-cols-2 gap-2 pb-safe">
            {SHOTS.map((t) => (
              <button key={t} type="button"
                onPointerDown={(e) => { e.preventDefault(); press(t); }}
                onPointerUp={() => release(t)}
                onPointerCancel={() => release(t)}
                className={cn("relative size-16 overflow-hidden rounded-full border border-white/20 font-display text-sm font-bold uppercase text-white sm:size-20",
                  t === "topspin" ? "bg-[#1f6feb]/80" : t === "flat" ? "bg-[#e0307a]/80" : t === "lob" ? "bg-[#2fbf71]/80" : "bg-[#f2c230]/80 text-black")}>
                <span className="absolute inset-x-0 bottom-0 bg-white/35" style={{ height: `${(charge?.type === t ? charge.p : 0) * 100}%` }} aria-hidden />
                <span className="relative">{SHOT_KEYS[t].label}</span>
                {!touch && <span className="absolute right-2 top-1 text-[10px] opacity-70">{SHOT_KEYS[t].key}</span>}
              </button>
            ))}
          </div>
          <button type="button" disabled={meter < 1} onClick={() => { special.current = !special.current; setSpecialOn(special.current); }} aria-pressed={specialOn}
            className={cn("absolute bottom-48 right-4 flex items-center gap-1 rounded-full px-3 py-2 text-xs font-bold uppercase text-white sm:bottom-52",
              meter >= 1 ? (specialOn ? "bg-[#ff7a1a] ring-2 ring-white" : "animate-pulse bg-[#ff7a1a]/80") : "bg-black/50")}>
            <Zap className="size-4" aria-hidden /> Power {Math.round(meter * 100)}%{!touch && " (E)"}
          </button>
          {!touch && (
            <div className="pointer-events-none absolute bottom-4 left-4 rounded-xl bg-black/50 px-3 py-2 text-xs text-white/80">
              Move: WASD / arrows · Sprint: Shift · Shots: J/Space topspin, K flat, L lob, U drop — hold for power, release as the ball arrives. Aim with left/right as you release.
            </div>
          )}
        </>
      )}

      {ended && st.score.winner !== null && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
          {renderEnd({ winner: st.score.winner, score: st.score, stats: st.stats })}
        </div>
      )}
    </div>
  );
}
