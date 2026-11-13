import { HelpCircle, Keyboard, Smartphone, Target, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GameButton } from "@/components/game/GameButton";
import { cn } from "@/lib/utils";

export type GuideSport = "tennis" | "racing" | "bowling" | "golf" | "athletics";
type AthleticsEvent = "sprint100" | "hurdles110" | "longjump" | "javelin";

interface Row { keys: string[]; action: string }
interface Section { title?: string; keyboard: Row[]; touch: Row[] }
interface Guide { name: string; goal: string; sections: Section[]; tips: string[] }

const RUN_KB: Row = { keys: ["←", "→"], action: "Run: press the lit arrow, alternating left and right (A / D also work). A steady rhythm is faster than mashing." };
const RUN_TOUCH: Row = { keys: ["◀", "▶"], action: "Run: tap the glowing pad, alternating left and right, in a steady rhythm." };

const ATHLETICS: Record<AthleticsEvent, Section> = {
  sprint100: {
    title: "100m Dash",
    keyboard: [RUN_KB, { keys: ["Wait"], action: "Don't press before the gun, or it's a false start." }],
    touch: [RUN_TOUCH, { keys: ["Wait"], action: "Don't tap before the gun, or it's a false start." }],
  },
  hurdles110: {
    title: "110m Hurdles",
    keyboard: [RUN_KB, { keys: ["Space", "↑"], action: "Jump: press just before each hurdle. Clipping one slows you down." }],
    touch: [RUN_TOUCH, { keys: ["Jump"], action: "Tap Jump just before each hurdle." }],
  },
  longjump: {
    title: "Long Jump",
    keyboard: [RUN_KB, { keys: ["Hold Space"], action: "At the board: hold to raise the take-off angle, then release when the meter is in the green." }],
    touch: [RUN_TOUCH, { keys: ["Hold Jump"], action: "At the board: hold to raise the angle, then release in the green." }],
  },
  javelin: {
    title: "Javelin",
    keyboard: [RUN_KB, { keys: ["Hold Space"], action: "Before the line: hold to set the throw angle, then release in the green (about 36°)." }],
    touch: [RUN_TOUCH, { keys: ["Hold Throw"], action: "Before the line: hold to set the angle, then release in the green." }],
  },
};

function guideFor(sport: GuideSport, events?: string[]): Guide {
  switch (sport) {
    case "tennis":
      return {
        name: "Tennis",
        goal: "Land the ball in your opponent's court and win points. Win games, then sets, to take the match.",
        sections: [{
          keyboard: [
            { keys: ["W A S D", "Arrows"], action: "Move around the court" },
            { keys: ["Shift"], action: "Sprint" },
            { keys: ["J", "Space"], action: "Topspin: your safe, everyday shot" },
            { keys: ["K"], action: "Flat: fast and hard" },
            { keys: ["L"], action: "Lob: high, over a player at the net" },
            { keys: ["U"], action: "Drop shot: short, just over the net" },
            { keys: ["Hold", "Release"], action: "Hold a shot key to charge power. Release as the ball reaches you." },
            { keys: ["← / →"], action: "Hold left or right while releasing to aim" },
            { keys: ["E"], action: "Power shot when the meter is full" },
          ],
          touch: [
            { keys: ["Left side"], action: "Drag anywhere on the left half of the screen to move. Drag far to sprint." },
            { keys: ["Shot buttons"], action: "Topspin, Flat, Lob, Drop: hold to charge, release as the ball arrives" },
            { keys: ["Power"], action: "Tap when the meter is full for a power shot" },
          ],
        }],
        tips: ["When it's your serve, press any shot key or button to serve.", "Turn on Auto-run (top right) and the game moves you to the ball, so you only time your shots."],
      };
    case "racing":
      return {
        name: "Racing",
        goal: "Finish all laps ahead of everyone else. Stay on the track and hit your apexes.",
        sections: [{
          keyboard: [
            { keys: ["W", "↑"], action: "Accelerate" },
            { keys: ["S", "↓"], action: "Brake, then reverse" },
            { keys: ["A D", "← →"], action: "Steer" },
            { keys: ["Space"], action: "Drift: hold through tight corners" },
            { keys: ["R"], action: "Back on track if you're stuck or facing the wrong way" },
          ],
          touch: [
            { keys: ["◀ ▶"], action: "Steer (bottom left)" },
            { keys: ["Gas"], action: "Accelerate. With Auto-gas on, the car accelerates for you." },
            { keys: ["Brake"], action: "Slow down for corners" },
            { keys: ["Drift"], action: "Hold through tight corners" },
          ],
        }],
        tips: ["Brake before a corner, not in it.", "The mini-map (top right) shows every car's position."],
      };
    case "bowling":
      return {
        name: "Bowling",
        goal: "Knock down all ten pins. A strike in one ball, a spare in two. Ten frames, highest score wins.",
        sections: [{
          keyboard: [
            { keys: ["← / →"], action: "Move your starting spot on the lane" },
            { keys: ["A / D"], action: "Aim the angle" },
            { keys: ["Q / E"], action: "Add hook spin left or right" },
            { keys: ["Hold Space"], action: "Charge power, then release to bowl" },
          ],
          touch: [
            { keys: ["Swipe up"], action: "Swipe up on the lane to bowl. A faster swipe gives more speed." },
            { keys: ["Curve"], action: "Curve your swipe to add hook" },
            { keys: ["Bowl button"], action: "Or hold the button to charge, then release" },
          ],
        }],
        tips: ["Aim for the pocket, just to the side of the head pin, for the best strike chance."],
      };
    case "golf":
      return {
        name: "Golf",
        goal: "Get the ball in the hole in as few strokes as possible. Lowest total score wins.",
        sections: [{
          keyboard: [
            { keys: ["← / →"], action: "Aim" },
            { keys: ["↑ / ↓"], action: "Change club" },
            { keys: ["Hold Space"], action: "Build power, then release to swing" },
            { keys: ["Space"], action: "Press again as the needle crosses the gold line. Early hooks, late slices." },
          ],
          touch: [
            { keys: ["Drag"], action: "Drag the view to aim (or use the ◀ ▶ buttons)" },
            { keys: ["Clubs"], action: "Tap a club; the game suggests one for the distance" },
            { keys: ["Hold Swing"], action: "Build power, release, then tap again on the gold line" },
          ],
        }],
        tips: ["Watch the wind arrow, and use the putter on the green."],
      };
    case "athletics": {
      const list = (events?.length ? events : ["sprint100", "hurdles110", "longjump", "javelin"]).filter((e): e is AthleticsEvent => e in ATHLETICS);
      return {
        name: "Athletics",
        goal: list.length > 1 ? "Compete in every event. Places earn points (1st: 10, 2nd: 8 …) and the most points takes gold." : "Beat the field: fastest time, or the longest mark over three attempts.",
        sections: list.map((e) => ATHLETICS[e]),
        tips: ["In field events, stepping over the board or line is a foul (no mark). Your best attempt counts."],
      };
    }
  }
}

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1">
      {keys.map((k, i) => (
        <kbd key={i} className="min-w-8 rounded-md border border-white/25 border-b-[3px] bg-white/10 px-1.5 py-0.5 text-center font-mono text-[11px] font-bold text-white">{k}</kbd>
      ))}
    </span>
  );
}

function useCoarse() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => setCoarse(window.matchMedia?.("(pointer: coarse)").matches ?? false), []);
  return coarse;
}

/** The guide content itself: goal, controls (keyboard or touch tab), tips. */
export function ControlsGuideBody({ sport, events, compact }: { sport: GuideSport; events?: string[] | undefined; compact?: boolean }) {
  const coarse = useCoarse();
  const [device, setDevice] = useState<"keyboard" | "touch" | null>(null);
  const tab = device ?? (coarse ? "touch" : "keyboard");
  const g = guideFor(sport, events);
  return (
    <div className="text-white">
      <p className="flex items-start gap-2 text-sm text-white/85"><Target className="mt-0.5 size-4 shrink-0 text-[#ffd23f]" aria-hidden />{g.goal}</p>
      <div role="tablist" aria-label="Control type" className="mt-3 inline-flex rounded-full bg-white/10 p-1">
        {(["keyboard", "touch"] as const).map((d) => (
          <button key={d} type="button" role="tab" aria-selected={tab === d} onClick={() => setDevice(d)}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold uppercase transition-colors", tab === d ? "bg-white text-black" : "text-white/75 hover:text-white")}>
            {d === "keyboard" ? <Keyboard className="size-3.5" aria-hidden /> : <Smartphone className="size-3.5" aria-hidden />}
            {d === "keyboard" ? "Keyboard" : "Touch"}
          </button>
        ))}
      </div>
      <div className={cn("mt-3 space-y-3", !compact && "max-h-[50dvh] overflow-y-auto pr-1")}>
        {g.sections.map((s, i) => (
          <div key={i}>
            {s.title && <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-[#ffb35c]">{s.title}</p>}
            <ul className="space-y-1.5">
              {(tab === "keyboard" ? s.keyboard : s.touch).map((r, j) => (
                <li key={j} className="flex items-start gap-3 rounded-xl bg-white/[0.06] px-3 py-2">
                  <Keys keys={r.keys} />
                  <span className="text-[13px] leading-snug text-white/85">{r.action}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {g.tips.length > 0 && (
          <ul className="space-y-1 text-xs text-white/65">
            {g.tips.map((t, i) => <li key={i}>💡 {t}</li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

function Panel({ sport, children, onClose, title }: { sport: GuideSport; children: ReactNode; onClose?: () => void; title: string }) {
  return (
    <div className="glass relative w-full max-w-lg rounded-3xl p-5 shadow-2xl animate-rise sm:p-6" role="dialog" aria-modal="true" aria-labelledby="controls-guide-title">
      {onClose && (
        <button type="button" onClick={onClose} className="absolute right-3 top-3 rounded-full p-1.5 text-white/70 hover:bg-white/10 hover:text-white" aria-label="Close guide">
          <X className="size-5" aria-hidden />
        </button>
      )}
      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/55">How to play</p>
      <h2 id="controls-guide-title" className="font-display text-3xl font-black uppercase text-white">{title}</h2>
      <div className="mt-3">{children}</div>
      <span className="sr-only">{sport}</span>
    </div>
  );
}

/**
 * Shown before a game starts. The game underneath isn't mounted until the player is ready,
 * so nothing happens behind it. Enter or Space also starts.
 */
export function ControlsGate({ sport, events, children, startLabel = "I'm ready — start" }: { sport: GuideSport; events?: string[]; children: ReactNode; startLabel?: string }) {
  const [ready, setReady] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ready) return;
    btn.current?.focus();
    const on = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setReady(true);
      }
    };
    // Small delay so the key that opened the game doesn't also dismiss the guide.
    const t = setTimeout(() => window.addEventListener("keydown", on), 350);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", on);
    };
  }, [ready]);
  if (ready) return <>{children}</>;
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-[radial-gradient(ellipse_at_top,#1b2550,#05060d_70%)] p-4 pt-safe pb-safe">
      <Panel sport={sport} title={guideFor(sport, events).name}>
        <ControlsGuideBody sport={sport} events={events} />
        <GameButton ref={btn} variant="hot" size="lg" className="mt-5 w-full" onClick={() => setReady(true)}>{startLabel}</GameButton>
        <p className="mt-2 text-center text-[11px] text-white/50">Press Enter or Space to start · Open this again any time with the ? button</p>
      </Panel>
    </div>
  );
}

/** "?" button that opens the guide over the game. It doesn't pause online games. */
export function ControlsHelpButton({ sport, events, className }: { sport: GuideSport; events?: string[] | undefined; className?: string }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    // Capture phase: keys go to the guide, not the game underneath.
    const on = (e: KeyboardEvent) => {
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
      <button type="button" onClick={() => setOpen(true)} className={cn("glass pointer-events-auto rounded-full p-2 text-white", className)} aria-label="How to play: controls">
        <HelpCircle className="size-5" aria-hidden />
      </button>
      {open && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}>
          <Panel sport={sport} title={guideFor(sport, events).name} onClose={() => setOpen(false)}>
            <ControlsGuideBody sport={sport} events={events} />
            <GameButton variant="hot" className="mt-4 w-full" onClick={() => setOpen(false)}>Back to the game</GameButton>
          </Panel>
        </div>
      )}
    </>
  );
}

/** Inline card for lobbies and loading screens. */
export function ControlsCard({ sport, events, className }: { sport: GuideSport; events?: string[] | undefined; className?: string }) {
  return (
    <section className={cn("glass rounded-3xl p-5 text-left", className)} aria-label="Controls guide">
      <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-white/55">How to play · {guideFor(sport, events).name}</p>
      <div className="mt-2"><ControlsGuideBody sport={sport} events={events} compact /></div>
    </section>
  );
}
