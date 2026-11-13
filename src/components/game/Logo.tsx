import { cn } from "@/lib/utils";

export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-display font-black uppercase italic tracking-tight", size === "lg" ? "text-5xl sm:text-6xl" : "text-2xl", className)}>
      <span aria-hidden className={cn("inline-flex items-center justify-center rounded-lg bg-gradient-hot not-italic text-accent-foreground", size === "lg" ? "size-14 text-4xl" : "size-8 text-xl")}>P</span>
      <span>Play<span className="text-primary">verse</span></span>
    </span>
  );
}
