import { createFileRoute } from "@tanstack/react-router";
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
      <div className="grid gap-5 sm:grid-cols-2">{SPORTS.map((s) => <SportCard key={s.id} sport={s} />)}</div>
    </PageShell>
  ),
});
