import { RotateCw, Settings2, X } from "lucide-react";
import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { GameButton } from "@/components/game/GameButton";
import { DEFAULT_SETTINGS, RACE_VIEWS, useGameSettings, type GameSettings } from "@/lib/game-settings";
import { useTouchMode } from "@/lib/input-mode";
import { cn } from "@/lib/utils";

/** CSS variables for a game screen: control size from the player's settings. */
export function ctlStyle(s: GameSettings): CSSProperties {
  return { ["--ctl" as string]: String(s.buttonScale) } as CSSProperties;
}

/**
 * Stops the browser from hijacking touches on a game screen: pinch-zoom, double-tap zoom,
 * long-press menus and pull-to-refresh. Multi-touch inside the game keeps working.
 */
export function useGameSurface(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.preventDefault();
    const pinch = (e: TouchEvent) => {
      if (e.touches.length > 1 && (e as TouchEvent & { scale?: number }).scale !== undefined && (e as TouchEvent & { scale?: number }).scale !== 1) e.preventDefault();
    };
    let lastTap = 0;
    const dbl = (e: TouchEvent) => {
      const now = performance.now();
      // A quick second tap on the canvas would zoom on iOS; buttons still get their clicks.
      if (now - lastTap < 300 && e.target === e.currentTarget) e.preventDefault();
      lastTap = now;
    };
    el.addEventListener("contextmenu", stop);
    el.addEventListener("touchmove", pinch, { passive: false });
    el.addEventListener("touchend", dbl, { passive: false });
    document.addEventListener("gesturestart", stop);
    document.addEventListener("gesturechange", stop);
    const html = document.documentElement;
    const prev = html.style.overscrollBehavior;
    html.style.overscrollBehavior = "none";
    return () => {
      el.removeEventListener("contextmenu", stop);
      el.removeEventListener("touchmove", pinch);
      el.removeEventListener("touchend", dbl);
      document.removeEventListener("gesturestart", stop);
      document.removeEventListener("gesturechange", stop);
      html.style.overscrollBehavior = prev;
    };
  }, [ref]);
}

/** Phones in portrait: suggest turning sideways (landscape is the default way to play). */
export function RotateHint() {
  const touch = useTouchMode();
  const [s, set] = useGameSettings();
  const [portrait, setPortrait] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem("pv.rotateDismissed") === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const check = () => setPortrait(window.innerHeight > window.innerWidth * 1.1);
    check();
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);
  if (!touch || !portrait || dismissed || !s.landscapeHint) return null;
  const close = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem("pv.rotateDismissed", "1");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-6 text-center text-white" role="dialog" aria-label="Turn your phone sideways">
      <div>
        <RotateCw className="mx-auto size-14 animate-[spin_2.4s_ease-in-out_infinite]" aria-hidden />
        <p className="mt-3 font-display text-3xl font-black uppercase">Turn your phone sideways</p>
        <p className="mt-1 text-sm text-white/75">Landscape gives you the best view and room for both thumbs.</p>
        <div className="mt-5 flex flex-col items-center gap-2">
          <GameButton variant="glass" onClick={close}>Play upright anyway</GameButton>
          <button type="button" className="text-xs text-white/60 underline" onClick={() => { set({ landscapeHint: false }); close(); }}>Don't suggest this again</button>
        </div>
      </div>
    </div>
  );
}

function Seg<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { id: T; name: string; hint?: string }[]; onChange: (v: T) => void }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-bold uppercase tracking-wider text-white/65">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button key={o.id} type="button" aria-pressed={value === o.id} onClick={() => onChange(o.id)} title={o.hint}
            className={cn("rounded-full px-3 py-1.5 text-sm font-bold", value === o.id ? "bg-white text-black" : "bg-white/10 text-white hover:bg-white/20")}>
            {o.name}
          </button>
        ))}
      </div>
      {options.find((o) => o.id === value)?.hint && <p className="mt-1 text-xs text-white/55">{options.find((o) => o.id === value)!.hint}</p>}
    </fieldset>
  );
}

function Slider({ label, value, min, max, step, format, onChange }: { label: string; value: number; min: number; max: number; step: number; format: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs font-bold uppercase tracking-wider text-white/65"><span>{label}</span><span className="tabular-nums text-white">{format(value)}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-[#ff7a1a]" />
    </label>
  );
}

/** The one Controls & Camera settings panel (settings page and in-game). */
export function GameSettingsPanel({ racing = true, haptics = true }: { racing?: boolean; haptics?: boolean }) {
  const [s, set] = useGameSettings();
  return (
    <div className="space-y-4 text-white">
      <Slider label="Button size" value={s.buttonScale} min={0.8} max={1.4} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ buttonScale: v })} />
      <Slider label="Camera & drag sensitivity" value={s.camSensitivity} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ camSensitivity: v })} />
      <Seg label="Camera behaviour" value={s.camMode} onChange={(v) => set({ camMode: v })} options={[
        { id: "dynamic", name: "Dynamic", hint: "The camera follows the action, looks ahead and reacts to speed." },
        { id: "steady", name: "Steady", hint: "Minimal camera movement: calmer framing, no speed effects." },
        { id: "manual", name: "Manual", hint: "Like Dynamic, plus free look where a game supports it (golf: drag the view to look along your aim)." },
      ]} />
      <Seg label="Graphics" value={s.graphics} onChange={(v) => set({ graphics: v })} options={[
        { id: "realistic", name: "Realistic", hint: "Motion-captured athletes, officials and a full crowd (tennis for now). Applies from the next match." },
        { id: "classic", name: "Classic", hint: "The original stylised characters. Lighter on older phones." },
      ]} />
      <Seg label="Dominant hand" value={s.hand} onChange={(v) => set({ hand: v })} options={[
        { id: "right", name: "Right-handed", hint: "Actions on the right, movement and aim on the left." },
        { id: "left", name: "Left-handed", hint: "Actions on the left, movement and aim on the right." },
      ]} />
      {racing && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
          <p className="font-display text-sm font-black uppercase tracking-wider text-[#ff7a1a]">Racing · driving experience</p>
          <Seg label="Steering (touch)" value={s.steering} onChange={(v) => set({ steering: v })} options={[
            { id: "wheel", name: "Wheel", hint: "Drag the on-screen steering wheel left and right." },
            { id: "buttons", name: "Buttons", hint: "Hold the left/right arrows." },
            { id: "tilt", name: "Tilt", hint: "Tilt your phone like a steering wheel. Re-centre any time; sensitivity follows the slider above." },
            { id: "tap", name: "Tap", hint: "Tap or hold the left or right side of the screen to steer." },
          ]} />
          <p className="text-xs text-white/55">Keyboard (WASD / arrows) and game controllers (left stick, RT gas, LT brake, A drift, B look back, Y camera) always work alongside your touch choice.</p>
          <Seg label="Steering assist" value={s.steerAssist} onChange={(v) => set({ steerAssist: v })} options={[
            { id: "off", name: "Off", hint: "You steer everything." },
            { id: "low", name: "Low", hint: "Gentle help toward the racing line when you aren't steering hard." },
            { id: "high", name: "High", hint: "Follows the racing line for you; you can still override." },
          ]} />
          <Seg label="Braking assist" value={s.brakeAssist} onChange={(v) => set({ brakeAssist: v })} options={[
            { id: "off", name: "Off" }, { id: "low", name: "Low", hint: "Lifts off and brakes a little before sharp corners." }, { id: "high", name: "High", hint: "Brakes for every corner automatically." },
          ]} />
          <Seg label="Racing line" value={s.racingLine} onChange={(v) => set({ racingLine: v })} options={[
            { id: "off", name: "Off" }, { id: "corners", name: "Corners", hint: "Shown only into corners: red = brake, green = power." }, { id: "full", name: "Full", hint: "The whole lap." },
          ]} />
          <Seg label="Racing camera" value={s.raceView} onChange={(v) => set({ raceView: v })} options={RACE_VIEWS} />
          <Slider label="Field of view" value={s.camFov} min={-10} max={20} step={1} format={(v) => `${v > 0 ? "+" : ""}${v}°`} onChange={(v) => set({ camFov: v })} />
          <Slider label="Camera height" value={s.camHeight} min={-0.6} max={1.5} step={0.1} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(1)} m`} onChange={(v) => set({ camHeight: v })} />
          <Slider label="Chase distance" value={s.camDistance} min={-2} max={5} step={0.25} format={(v) => `${v > 0 ? "+" : ""}${v.toFixed(2)} m`} onChange={(v) => set({ camDistance: v })} />
          <Slider label="Camera shake" value={s.camShake} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ camShake: v })} />
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold">Look into corners</span>
            <input type="checkbox" className="size-5 accent-[#ff7a1a]" checked={s.lookApex} onChange={(e) => set({ lookApex: e.target.checked })} />
          </label>
          <Slider label="Controller rumble" value={s.padRumble} min={0} max={1} step={0.05} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => set({ padRumble: v })} />
        </div>
      )}
      {haptics && <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">Vibration (haptic feedback)</span>
        <input type="checkbox" className="size-5 accent-[#ff7a1a]" checked={s.haptics} onChange={(e) => set({ haptics: e.target.checked })} />
      </label>}
      <label className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold">Suggest landscape on phones</span>
        <input type="checkbox" className="size-5 accent-[#ff7a1a]" checked={s.landscapeHint} onChange={(e) => set({ landscapeHint: e.target.checked })} />
      </label>
      <button type="button" className="text-xs text-white/60 underline" onClick={() => set({ ...DEFAULT_SETTINGS })}>Reset to defaults</button>
    </div>
  );
}

/** Gear button in every game: opens Controls & Camera settings without leaving the match. */
export function GameSettingsButton({ racing = false, className }: { racing?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Keys go to the panel, not the game underneath.
    const on = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === "INPUT") return;
      e.stopImmediatePropagation();
      if (e.type === "keydown" && e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", on, true);
    window.addEventListener("keyup", on, true);
    return () => {
      window.removeEventListener("keydown", on, true);
      window.removeEventListener("keyup", on, true);
    };
  }, [open]);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cn("glass pointer-events-auto rounded-full p-2 text-white", className)} aria-label="Controls and camera settings">
        <Settings2 className="size-5" aria-hidden />
      </button>
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex overflow-y-auto bg-black/60 p-3" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="glass relative m-auto w-full max-w-md rounded-3xl p-5 animate-rise" role="dialog" aria-modal="true" aria-label="Controls and camera settings">
            <button type="button" onClick={() => setOpen(false)} className="absolute right-3 top-3 rounded-full p-1.5 text-white/70 hover:bg-white/10" aria-label="Close settings"><X className="size-5" aria-hidden /></button>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/55">Settings</p>
            <h2 className="mb-4 font-display text-2xl font-black uppercase text-white">Controls & camera</h2>
            <GameSettingsPanel racing={racing} />
            <GameButton variant="hot" className="mt-5 w-full" onClick={() => setOpen(false)}>Back to the game</GameButton>
          </div>
        </div>
      )}
    </>
  );
}
