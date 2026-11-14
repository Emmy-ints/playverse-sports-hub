/** Practice missions for a run: three objectives judged from the finished race state. */
import { CheckCircle2, Circle, Star } from "lucide-react";
import { useEffect, useState } from "react";
import { placings, type CourseLength, type RaceState } from "@/game/parkour/sim";
import { cn } from "@/lib/utils";

const PAR: Record<CourseLength, number> = { sprint: 26, standard: 40, marathon: 58 };
const KEY = "pv.parkour.stars.v1";

export function ParkourMissions({ s, viewer, length }: { s: RaceState; viewer: number; length: CourseLength }) {
  const me = s.runners[viewer]!;
  const missions = [
    { text: `Finish under ${PAR[length]} s`, done: me.finish !== null && me.finish < PAR[length] },
    { text: "Land a ×5 combo", done: me.bestCombo >= 5 },
    { text: "Clean run: no trips or falls", done: me.finish !== null && me.hits === 0 && me.falls === 0 },
    { text: "Take the win", done: placings(s)[0] === viewer },
  ];
  const stars = missions.filter((m) => m.done).length;
  const [best, setBest] = useState(0);
  useEffect(() => {
    try {
      const all = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, number>;
      const prev = all[length] ?? 0;
      setBest(Math.max(prev, stars));
      if (stars > prev) localStorage.setItem(KEY, JSON.stringify({ ...all, [length]: stars }));
    } catch {
      setBest(stars);
    }
  }, [length, stars]);
  return (
    <div className="mt-3 rounded-2xl bg-white/5 p-3 text-left">
      <div className="mb-1 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-white/60">Missions</p>
        <span className="flex gap-0.5" aria-label={`${stars} of ${missions.length} stars`}>
          {missions.map((m, i) => <Star key={i} className={cn("size-4", i < stars ? "fill-[#ffd23f] text-[#ffd23f]" : "text-white/25")} aria-hidden />)}
        </span>
      </div>
      <ul className="space-y-0.5 text-sm">
        {missions.map((m) => (
          <li key={m.text} className={cn("flex items-center gap-2", m.done ? "text-white" : "text-white/50")}>
            {m.done ? <CheckCircle2 className="size-4 text-[#7cff6b]" aria-hidden /> : <Circle className="size-4" aria-hidden />}{m.text}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-[11px] text-white/50">Best on {length}: {best}/{missions.length} stars</p>
    </div>
  );
}
