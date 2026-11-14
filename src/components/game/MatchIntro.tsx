import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { describeConfig } from "@/lib/match-config";
import { getSport, type SportId } from "@/lib/sports";
import { getSupabase } from "@/lib/supabase";
import type { AvatarConfig } from "@/lib/avatar";
import { AvatarPreview } from "./AvatarPreview";

interface IntroPlayer { id: string; name: string; level: number; avatar: AvatarConfig | null; played: number; wins: number }

/**
 * Match announcement + player introductions for online matches: venue, format and both competitors
 * with level and record. Shows for a few seconds while the game connects; tap or press any key to skip.
 */
export function MatchIntro({ matchId }: { matchId: string }) {
  const [hidden, setHidden] = useState(false);
  const q = useQuery({
    queryKey: ["match-intro", matchId],
    staleTime: Infinity,
    queryFn: async () => {
      const sb = getSupabase();
      if (!sb) return null;
      const { data: m } = await sb.from("matches").select("sport, config, status").eq("id", matchId).maybeSingle();
      if (!m || m.status === "completed") return null;
      const { data: parts } = await sb.from("match_participants").select("player_id, slot").eq("match_id", matchId).order("slot");
      const ids = (parts ?? []).map((p) => p.player_id as string);
      const [{ data: profs }, { data: stats }] = await Promise.all([
        sb.from("profiles").select("id, display_name, level, avatar_config").in("id", ids),
        sb.from("player_statistics").select("player_id, matches_played, wins").eq("sport", m.sport).in("player_id", ids),
      ]);
      const players: IntroPlayer[] = ids.flatMap((id) => {
        const p = (profs ?? []).find((x) => x.id === id);
        if (!p) return [];
        const st = (stats ?? []).find((x) => x.player_id === id);
        return [{ id, name: p.display_name as string, level: p.level as number, avatar: (p.avatar_config ?? null) as AvatarConfig | null, played: (st?.matches_played as number) ?? 0, wins: (st?.wins as number) ?? 0 }];
      });
      return { sport: m.sport as SportId, config: (m.config ?? {}) as { mode?: string; length?: number }, players };
    },
  });
  useEffect(() => {
    if (!q.data) return undefined;
    const t = setTimeout(() => setHidden(true), 3200);
    const skip = () => setHidden(true);
    window.addEventListener("keydown", skip, { once: true });
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", skip);
    };
  }, [q.data]);
  if (hidden || !q.data || q.data.players.length < 2) return null;
  const { sport, config, players } = q.data;
  const s = getSport(sport);
  const [a, b] = players as [IntroPlayer, IntroPlayer];
  const Card = ({ p, side }: { p: IntroPlayer; side: "l" | "r" }) => (
    <div className={`flex flex-col items-center ${side === "l" ? "animate-[slideInLeft_.5s_ease-out]" : "animate-[slideInRight_.5s_ease-out]"}`}>
      <div className="h-40 w-28 sm:h-56 sm:w-40">{p.avatar ? <AvatarPreview config={p.avatar} /> : null}</div>
      <p className="mt-1 max-w-[40vw] truncate font-display text-2xl font-black uppercase sm:text-4xl">{p.name}</p>
      <p className="text-xs text-white/70 sm:text-sm">Level {p.level} · {p.wins}W–{Math.max(0, p.played - p.wins)}L in {s?.name ?? sport}</p>
    </div>
  );
  return (
    <button type="button" onClick={() => setHidden(true)} className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/80 p-4 text-white backdrop-blur-sm" aria-label="Match introduction. Tap to skip.">
      {s && <img src={s.image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-25" />}
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-primary">{s?.venue ?? sport}</p>
      <p className="mb-4 text-sm text-white/75">{describeConfig(sport, config)}</p>
      <div className="flex items-center gap-4 sm:gap-10">
        <Card p={a} side="l" />
        <span className="font-display text-5xl font-black italic text-primary sm:text-7xl">VS</span>
        <Card p={b} side="r" />
      </div>
      <p className="mt-6 text-xs text-white/50">Tap or press any key to skip</p>
    </button>
  );
}
