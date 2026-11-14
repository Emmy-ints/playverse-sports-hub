/**
 * Practice personal bests, stored on this device (practice results are never sent to rankings).
 * Mount when a result is final; it compares, saves and shows "New personal best!".
 */
import { Award } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const KEY = "pv.pb.v1";

function readAll(): Record<string, number> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return v && typeof v === "object" ? (v as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function getPersonalBest(id: string): number | null {
  const v = readAll()[id];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function PersonalBest({ id, value, lowerIsBetter = false, format = String, label, className }: {
  id: string; value: number | null; lowerIsBetter?: boolean; format?: (v: number) => string; label?: string; className?: string;
}) {
  const [prev] = useState(() => getPersonalBest(id));
  const better = value !== null && Number.isFinite(value) && (prev === null || (lowerIsBetter ? value < prev : value > prev));
  useEffect(() => {
    if (!better || value === null) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [id]: value }));
    } catch {
      /* storage unavailable */
    }
  }, [better, id, value]);
  if (value === null && prev === null) return null;
  return (
    <p className={cn("mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold", better ? "bg-gold/20 text-gold animate-rise" : "bg-white/10 text-white/70", className)}>
      <Award className="size-3.5" aria-hidden />
      {better ? `New personal best${prev !== null ? ` (was ${format(prev)})` : ""}!` : `${label ?? "Personal best"}: ${format((prev ?? value)!)}`}
    </p>
  );
}
