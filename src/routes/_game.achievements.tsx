import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { Medal } from "lucide-react";

export const Route = createFileRoute("/_game/achievements")({
  head: () => ({ meta: [
    { title: "Achievements — PLAYVERSE" }, { name: "description", content: "Milestones and badges earned across PLAYVERSE." },
    { property: "og:title", content: "Achievements — PLAYVERSE" }, { property: "og:description", content: "Milestones and badges earned across PLAYVERSE." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Achievements" description="Milestones and badges earned across PLAYVERSE.">
      <EmptyState icon={<Medal />} title="No achievements yet" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
