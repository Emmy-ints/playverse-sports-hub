import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageShell({ eyebrow, title, description, actions, children, className }: {
  eyebrow?: string; title: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:py-10", className)}>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 animate-rise">
        <div>
          {eyebrow && <p className="font-display text-sm font-bold uppercase tracking-[0.25em] text-accent">{eyebrow}</p>}
          <h1 className="font-display text-4xl font-black uppercase leading-none sm:text-5xl">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
