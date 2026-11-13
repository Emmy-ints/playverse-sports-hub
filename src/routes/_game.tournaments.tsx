import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_game/tournaments")({
  head: () => ({ meta: [
    { title: "Tournaments — PLAYVERSE" }, { name: "description", content: "Scheduled competitive events with brackets and prizes." },
    { property: "og:title", content: "Tournaments — PLAYVERSE" }, { property: "og:description", content: "Scheduled competitive events with brackets and prizes." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Tournaments" description="Scheduled competitive events with brackets and prizes.">
      <EmptyState icon={<Trophy />} title="No tournaments scheduled" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
