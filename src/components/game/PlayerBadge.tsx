import { cn } from "@/lib/utils";
import type { AvatarConfig } from "@/lib/avatar";
import { AvatarPreview } from "./AvatarPreview";

export function PlayerBadge({ avatar, name, level, size = "md", className }: {
  avatar: AvatarConfig | null; name: string; level: number; size?: "sm" | "md" | "lg"; className?: string;
}) {
  const dim = { sm: "size-10", md: "size-12", lg: "size-24" }[size];
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className={cn("relative shrink-0 overflow-hidden rounded-full bg-gradient-primary p-0.5", dim)}>
        <div className="h-full w-full overflow-hidden rounded-full bg-navy-deep">
          {avatar ? <AvatarPreview config={avatar} headOnly /> : <span className="flex h-full items-center justify-center font-display text-lg font-bold text-muted-foreground">?</span>}
        </div>
        <span className="absolute -bottom-0.5 -right-0.5 rounded-md bg-gradient-gold px-1 font-display text-[10px] font-bold leading-4 text-gold-foreground" aria-label={`Level ${level}`}>{level}</span>
      </div>
      <div className="min-w-0">
        <p className="truncate font-display text-lg font-bold leading-tight">{name}</p>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Level {level}</p>
      </div>
    </div>
  );
}
