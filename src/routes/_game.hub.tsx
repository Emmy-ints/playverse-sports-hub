import { createFileRoute } from "@tanstack/react-router";
import { HeroStage } from "@/components/game/HeroStage";
import { SportCard } from "@/components/game/SportCard";
import { SPORTS } from "@/lib/sports";

export const Route = createFileRoute("/_game/hub")({
  head: () => ({ meta: [
    { title: "Hub — PLAYVERSE" }, { name: "description", content: "Your PLAYVERSE home: pick a sport and start playing." },
    { property: "og:title", content: "Hub — PLAYVERSE" }, { property: "og:description", content: "Your PLAYVERSE home: pick a sport and start playing." },
  ] }),
  component: Hub,
});

function Hub() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 px-4 py-6 sm:px-6">
      <HeroStage />
      <section aria-labelledby="dest">
        <h2 id="dest" className="mb-4 font-display text-3xl font-black uppercase">Choose your arena</h2>
        <div className="grid gap-5 sm:grid-cols-2">{SPORTS.map((s) => <SportCard key={s.id} sport={s} />)}</div>
      </section>
    </div>
  );
}
