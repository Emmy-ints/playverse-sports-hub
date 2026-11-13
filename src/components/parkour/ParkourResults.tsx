import { Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { formatRaceTime } from "@/components/parkour/ParkourStage";
import { placings, type RaceState } from "@/game/parkour/sim";
import { cn } from "@/lib/utils";

export const RUNNER_COLORS = ["#ff7a1a", "#3ef0ff", "#ff3fb4", "#7cff6b", "#ffd23f", "#a78bfa"];

export function ParkourResults({ s, names, colors, viewer, actions, note }: { s: RaceState; names: string[]; colors: string[]; viewer: number; actions: ReactNode; note?: ReactNode }) {
  const order = placings(s);
  const mine = order.indexOf(viewer) + 1;
  const me = s.runners[viewer]!;
  return (
    <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white animate-rise">
      <Trophy className={cn("mx-auto size-10", mine === 1 ? "text-[#ffd23f]" : mine <= 3 ? "text-white" : "text-white/50")} aria-hidden />
      <h2 className="mt-2 font-display text-4xl font-black uppercase">{mine === 1 ? "You win!" : `${["1st", "2nd", "3rd", "4th", "5th", "6th"][mine - 1]} place`}</h2>
      <p className="text-sm text-white/75">Best combo {me.bestCombo} · {me.hits} trip{me.hits === 1 ? "" : "s"} · {me.falls} fall{me.falls === 1 ? "" : "s"}</p>
      <ol className="mt-4 space-y-1 text-left text-sm">
        {order.map((i, k) => (
          <li key={i} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", i === viewer ? "bg-white/15 font-bold" : "bg-white/5")}>
            <span className="w-6 font-display">{k + 1}</span>
            <span className="size-3 rounded-full" style={{ background: colors[i] }} />
            <span className="flex-1 truncate">{names[i]}</span>
            <span className="tabular-nums">{s.runners[i]!.finish !== null ? `${formatRaceTime(s.runners[i]!.finish!)} s` : "DNF"}</span>
          </li>
        ))}
      </ol>
      {note}
      <div className="mt-5 flex flex-wrap justify-center gap-2">{actions}</div>
    </div>
  );
}
