import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatPill({ icon, label, value, tone = "default", className }: {
  icon: ReactNode; label: string; value: ReactNode; tone?: "default" | "gold" | "primary" | "accent"; className?: string;
}) {
  const toneCls = { default: "text-foreground", gold: "text-gold", primary: "text-primary", accent: "text-accent" }[tone];
  return (
    <div className={cn("glass flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm", className)} aria-label={`${label}: ${value}`}>
      <span className={cn("[&_svg]:size-4", toneCls)} aria-hidden>{icon}</span>
      <span className="font-display text-base font-bold tabular-nums">{value}</span>
    </div>
  );
}
