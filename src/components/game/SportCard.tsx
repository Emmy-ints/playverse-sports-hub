import { Link } from "@tanstack/react-router";
import { Play, Users } from "lucide-react";
import type { Sport } from "@/lib/sports";
import { cn } from "@/lib/utils";

const toneRing: Record<Sport["tone"], string> = {
  tennis: "hover:ring-tennis/70 focus-within:ring-tennis/70",
  bowling: "hover:ring-bowling/70 focus-within:ring-bowling/70",
  golf: "hover:ring-golf/70 focus-within:ring-golf/70",
  racing: "hover:ring-racing/70 focus-within:ring-racing/70",
};
const toneText: Record<Sport["tone"], string> = { tennis: "text-tennis", bowling: "text-bowling", golf: "text-golf", racing: "text-racing" };

export function SportCard({ sport, className }: { sport: Sport; className?: string }) {
  return (
    <article className={cn("group relative isolate flex min-h-80 flex-col justify-end overflow-hidden rounded-3xl shadow-card ring-2 ring-transparent transition-all duration-300 hover:-translate-y-1 active:scale-[0.98]", toneRing[sport.tone], className)}>
      <img src={sport.image} alt="" width={1024} height={768} loading="lazy" className="absolute inset-0 -z-10 h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-sunset" />
      <div className="p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className={cn("font-display text-sm font-bold uppercase tracking-[0.2em]", toneText[sport.tone])}>{sport.name}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground" title="Online multiplayer is coming in a later update">
            <Users className="size-3" aria-hidden /> Up to {sport.maxPlayers} · online soon
          </span>
        </div>
        <h3 className="font-display text-3xl font-black uppercase leading-none">{sport.venue}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{sport.description}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Modes">
          {sport.modes.map((m) => <li key={m} className="rounded-md bg-secondary/80 px-2 py-0.5 text-xs font-medium">{m}</li>)}
        </ul>
        <Link to="/sports/$sport" params={{ sport: sport.id }} className="mt-4 inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-hot px-5 font-display text-base font-bold uppercase tracking-wider text-accent-foreground shadow-hot transition-transform hover:brightness-110 active:scale-95 after:absolute after:inset-0" aria-label={`Play ${sport.venue}`}>
          <Play className="size-4 fill-current" aria-hidden /> Play
        </Link>
      </div>
    </article>
  );
}
