import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ icon, title, description, action, className }: {
  icon: ReactNode; title: string; description: string; action?: ReactNode; className?: string;
}) {
  return (
    <div className={cn("glass flex flex-col items-center rounded-2xl px-6 py-12 text-center", className)}>
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-secondary text-primary [&_svg]:size-8" aria-hidden>{icon}</div>
      <h2 className="font-display text-2xl font-bold uppercase">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
