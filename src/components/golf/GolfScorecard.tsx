import { formatToPar, toPar } from "@/game/golf/scoring";
import { cn } from "@/lib/utils";

export interface GolfCardRow { name: string; card: readonly (number | null)[]; active?: boolean }

/** Compact golf scorecard: par row plus a row per player, coloured birdies/bogeys. */
export function GolfScorecard({ pars, rows, current }: { pars: readonly number[]; rows: GolfCardRow[]; current?: number }) {
  return (
    <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/70 p-1.5 backdrop-blur-md">
      <table className="border-collapse font-display text-white" aria-label="Scorecard">
        <thead>
          <tr className="text-[10px] uppercase text-white/60">
            <th className="px-2 text-left">Hole</th>
            {pars.map((_, i) => (
              <th key={i} className={cn("w-6 text-center", current === i && "text-accent")}>{i + 1}</th>
            ))}
            <th className="px-2">Tot</th>
          </tr>
          <tr className="text-[10px] text-white/60">
            <th className="px-2 text-left font-normal">Par</th>
            {pars.map((p, i) => <td key={i} className="text-center">{p}</td>)}
            <td className="px-2 text-center">{pars.reduce((a, b) => a + b, 0)}</td>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = r.card.reduce<number>((s, v) => s + (v ?? 0), 0);
            return (
              <tr key={r.name} className={cn(r.active && "bg-primary/20")}>
                <th scope="row" className="max-w-20 truncate px-2 text-left text-xs font-bold uppercase">{r.active && <span className="text-accent">▶ </span>}{r.name}</th>
                {pars.map((p, i) => {
                  const v = r.card[i];
                  const d = v == null ? 0 : v - p;
                  return (
                    <td key={i} className="text-center text-sm font-bold tabular-nums">
                      <span className={cn("inline-flex size-5 items-center justify-center", v != null && d < 0 && "rounded-full ring-1 ring-gold text-gold", v != null && d > 0 && "ring-1 ring-white/40")}>{v ?? ""}</span>
                    </td>
                  );
                })}
                <td className="px-2 text-center text-sm font-black tabular-nums text-gold">{total || ""} <span className="text-[10px] text-white/70">{formatToPar(toPar(r.card, pars))}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
