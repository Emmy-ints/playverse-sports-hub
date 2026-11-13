import { scoreGame } from "@/game/bowling/scoring";
import { cn } from "@/lib/utils";

export interface ScoreRow { name: string; rolls: readonly number[]; active?: boolean }

/** Classic ten-frame bowling scoreboard. */
export function Scoreboard({ rows, compact, frameCount = 10 }: { rows: ScoreRow[]; compact?: boolean; frameCount?: number }) {
  return (
    <div className="mx-auto w-fit max-w-full overflow-x-auto rounded-xl border border-white/10 bg-black/70 p-1.5 backdrop-blur-md">
      <table className="border-collapse font-display text-white" aria-label="Scoreboard">
        <tbody>
          {rows.map((r) => {
            const g = scoreGame(r.rolls, frameCount);
            return (
              <tr key={r.name} className={cn(r.active && "bg-primary/20")}>
                <th scope="row" className={cn("max-w-24 truncate px-2 text-left text-sm font-bold uppercase", compact && "max-w-16 text-xs")}>
                  {r.active && <span className="mr-1 text-accent">▶</span>}
                  {r.name}
                </th>
                {Array.from({ length: frameCount }, (_, i) => {
                  const f = g.frames[i];
                  const last = i === frameCount - 1;
                  const slots = last ? 3 : 2;
                  return (
                    <td key={i} className={cn("border border-white/15 p-0 text-center", g.currentFrame === i && r.active && "bg-accent/25")}>
                      <div className="flex justify-end">
                        {Array.from({ length: slots }, (_, s) => {
                          // Frames 1–9 show a strike in the second box, like a real scoreboard.
                          const marks = f?.marks ?? [];
                          const m = !last && marks[0] === "X" ? (s === 1 ? "X" : "") : (marks[s] ?? "");
                          return (
                            <span key={s} className={cn("inline-block w-4 border-b border-l border-white/15 text-[11px] leading-4 sm:w-5", m === "X" && "text-gold", m === "/" && "text-primary")}>
                              {m}
                            </span>
                          );
                        })}
                      </div>
                      <div className={cn("text-sm font-bold tabular-nums leading-5", compact ? "w-9" : "w-9 sm:w-11")}>{f?.total ?? ""}</div>
                    </td>
                  );
                })}
                <td className="border border-white/15 px-2 text-center text-lg font-black tabular-nums text-gold">{g.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
