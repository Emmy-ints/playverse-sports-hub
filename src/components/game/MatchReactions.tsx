import { Smile } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useMyProfile, useSession } from "@/lib/session";
import { getSupabase } from "@/lib/supabase";
import { buzz } from "@/lib/input-mode";
import { cn } from "@/lib/utils";

/** Preset quick reactions only (no free text), so they're safe to show to opponents. */
const REACTIONS = [
  { id: "gg", label: "GG", emoji: "🤝" },
  { id: "nice", label: "Nice shot!", emoji: "👏" },
  { id: "wow", label: "Wow!", emoji: "😮" },
  { id: "fire", label: "On fire", emoji: "🔥" },
  { id: "lol", label: "Haha", emoji: "😂" },
  { id: "close", label: "So close!", emoji: "😬" },
  { id: "luck", label: "Good luck!", emoji: "🍀" },
  { id: "wave", label: "Hi!", emoji: "👋" },
] as const;
type ReactionId = (typeof REACTIONS)[number]["id"];

interface Bubble { key: number; name: string; id: ReactionId; mine: boolean }

/**
 * In-match quick reactions for online matches: a small tray (or keys 1–8) sends a preset reaction to
 * everyone in the match over a realtime broadcast; incoming reactions float briefly at the top.
 */
export function MatchReactions({ matchId }: { matchId: string }) {
  const { session } = useSession();
  const profile = useMyProfile();
  const me = session?.user.id ?? null;
  const name = profile.data?.display_name ?? "Player";
  const [open, setOpen] = useState(false);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const chRef = useRef<RealtimeChannel | null>(null);
  const lastSent = useRef(0);
  const seq = useRef(0);

  const show = (b: Omit<Bubble, "key">) => {
    const key = ++seq.current;
    setBubbles((x) => [...x.slice(-3), { ...b, key }]);
    setTimeout(() => setBubbles((x) => x.filter((y) => y.key !== key)), 2600);
  };

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !me) return undefined;
    const ch = sb.channel(`react:${matchId}`, { config: { broadcast: { self: false } } });
    ch.on("broadcast", { event: "react" }, ({ payload }) => {
      const p = payload as { id?: string; name?: string; from?: string };
      const r = REACTIONS.find((x) => x.id === p.id);
      if (!r || p.from === me) return;
      show({ name: String(p.name ?? "Opponent").slice(0, 24), id: r.id, mine: false });
      buzz(15);
    }).subscribe();
    chRef.current = ch;
    return () => {
      chRef.current = null;
      void sb.removeChannel(ch);
    };
  }, [matchId, me]);

  const send = (id: ReactionId) => {
    const now = Date.now();
    if (now - lastSent.current < 1500) return; // gentle rate limit
    lastSent.current = now;
    void chRef.current?.send({ type: "broadcast", event: "react", payload: { id, name, from: me } });
    show({ name: "You", id, mine: true });
    setOpen(false);
  };

  // Keyboard shortcuts while the tray is open (keys 1–8), so they don't clash with game controls.
  useEffect(() => {
    if (!open) return undefined;
    const k = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= REACTIONS.length) {
        e.preventDefault();
        send(REACTIONS[n - 1]!.id);
      } else if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!me) return null;
  return (
    <>
      <div className="pointer-events-none fixed left-1/2 top-16 z-50 flex -translate-x-1/2 flex-col items-center gap-1.5" aria-live="polite">
        {bubbles.map((b) => {
          const r = REACTIONS.find((x) => x.id === b.id)!;
          return (
            <div key={b.key} className={cn("flex animate-rise items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold text-white shadow-lg", b.mine ? "bg-primary/80" : "bg-black/75")}>
              <span className="text-2xl" aria-hidden>{r.emoji}</span>
              <span>{b.name}: {r.label}</span>
            </div>
          );
        })}
      </div>
      <div className="fixed left-2 top-1/2 z-50 -translate-y-1/2">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label="Quick reactions"
          className="glass flex size-11 items-center justify-center rounded-full text-white active:scale-95"><Smile className="size-6" /></button>
        {open && (
          <div className="glass absolute left-12 top-1/2 grid w-56 -translate-y-1/2 grid-cols-2 gap-1 rounded-2xl p-2" role="menu">
            {REACTIONS.map((r, i) => (
              <button key={r.id} type="button" role="menuitem" onClick={() => send(r.id)} className="flex items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-sm font-bold text-white hover:bg-white/15">
                <span className="text-xl" aria-hidden>{r.emoji}</span>{r.label}<span className="ml-auto text-[10px] text-white/40">{i + 1}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
