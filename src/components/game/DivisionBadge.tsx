import { Shield } from "lucide-react";
import { divisionOf, divisionProgress } from "@/lib/divisions";
import { cn } from "@/lib/utils";

export function DivisionBadge({ rating, games, progress = false, className }: { rating: number; games: number; progress?: boolean; className?: string }) {
  const d = divisionOf(rating, games);
  const p = divisionProgress(rating, d);
  return (
    <span className={cn("inline-flex flex-col gap-0.5", className)} title={d.next ? `${d.next - rating} rating to next division` : d.name}>
      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide" style={{ background: `${d.color}26`, color: d.color }}>
        <Shield className="size-3" aria-hidden fill="currentColor" />{d.name}
      </span>
      {progress && d.next && <span className="h-1 w-full overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full" style={{ width: `${p * 100}%`, background: d.color }} /></span>}
    </span>
  );
}
