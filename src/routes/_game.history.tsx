import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { History } from "lucide-react";

export const Route = createFileRoute("/_game/history")({
  head: () => ({ meta: [
    { title: "Match history — PLAYVERSE" }, { name: "description", content: "Every match you have played across all four sports." },
    { property: "og:title", content: "Match history — PLAYVERSE" }, { property: "og:description", content: "Every match you have played across all four sports." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Match history" description="Every match you have played across all four sports.">
      <EmptyState icon={<History />} title="No matches played" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
