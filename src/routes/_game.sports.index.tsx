import { createFileRoute, Link } from "@tanstack/react-router";
import athletics from "@/assets/sport-athletics.jpg";
import { PageShell } from "@/components/game/PageShell";
import { SportCard } from "@/components/game/SportCard";
import { SPORTS } from "@/lib/sports";

export const Route = createFileRoute("/_game/sports/")({
  head: () => ({ meta: [
    { title: "Choose a sport — PLAYVERSE" }, { name: "description", content: "Tennis, Bowling, Golf and Racing." },
    { property: "og:title", content: "Choose a sport — PLAYVERSE" }, { property: "og:description", content: "Tennis, Bowling, Golf and Racing." },
  ] }),
  component: () => (
    <PageShell eyebrow="Play" title="Choose a sport">
      <div className="grid gap-5 sm:grid-cols-2">
        {SPORTS.map((s) => <SportCard key={s.id} sport={s} />)}
        <Link to="/play/athletics" className="group relative block overflow-hidden rounded-3xl sm:col-span-2">
          <img src={athletics} alt="" width={1600} height={600} className="h-56 w-full object-cover transition duration-500 group-hover:scale-105 sm:h-64" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="absolute bottom-0 p-5">
            <span className="rounded-full bg-[#ff7a1a] px-3 py-1 text-xs font-black uppercase text-white">New</span>
            <p className="mt-2 font-display text-4xl font-black uppercase text-white">Athletics</p>
            <p className="text-sm text-white/80">100m · Hurdles · Long jump · Javelin — in a packed stadium.</p>
          </div>
        </Link>
      </div>
    </PageShell>
  ),
});
