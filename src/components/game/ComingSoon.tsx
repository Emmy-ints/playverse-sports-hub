import { Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ComingSoon({ feature, detail, compact, children, className }: {
  feature: string; detail?: string; compact?: boolean; children?: ReactNode; className?: string;
}) {
  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground", className)}>
        <Hourglass className="size-3" aria-hidden /> Coming later
      </span>
    );
  }
  return (
    <div role="status" className={cn("glass rounded-2xl border-dashed p-6 text-center", className)}>
      <Hourglass className="mx-auto mb-3 size-8 text-accent" aria-hidden />
      <h3 className="font-display text-xl font-bold uppercase">{feature}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{detail ?? "Coming in a later update."}</p>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
