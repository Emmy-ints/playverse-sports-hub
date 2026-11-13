import { PRESENCE_LABEL, usePresence } from "@/lib/presence";
import { cn } from "@/lib/utils";

const TONE = { online: "bg-success", away: "bg-gold", in_lobby: "bg-primary", in_match: "bg-accent", offline: "bg-muted-foreground/40" } as const;

export function PresenceDot({ userId, withLabel = false, className }: { userId: string; withLabel?: boolean; className?: string }) {
  const status = usePresence(userId);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground", className)}>
      <span className={cn("size-2.5 rounded-full ring-2 ring-background", TONE[status])} aria-hidden />
      {withLabel ? PRESENCE_LABEL[status] : <span className="sr-only">{PRESENCE_LABEL[status]}</span>}
    </span>
  );
}
