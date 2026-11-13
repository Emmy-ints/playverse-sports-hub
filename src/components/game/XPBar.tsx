import { cn } from "@/lib/utils";

export function XPBar({ xp, max, className, showLabel = true }: { xp: number; max: number; className?: string; showLabel?: boolean }) {
  const pct = max > 0 ? Math.min(100, Math.round((xp / max) * 100)) : 0;
  return (
    <div className={cn("w-full", className)}>
      <div role="progressbar" aria-label="Experience" aria-valuemin={0} aria-valuemax={max} aria-valuenow={xp} className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-primary transition-[width] duration-700" style={{ width: `${pct}%` }} />
      </div>
      {showLabel && <p className="mt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground tabular-nums">{xp} / {max} XP</p>}
    </div>
  );
}
