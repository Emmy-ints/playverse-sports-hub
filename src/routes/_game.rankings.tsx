import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { Crown } from "lucide-react";

export const Route = createFileRoute("/_game/rankings")({
  head: () => ({ meta: [
    { title: "Rankings — PLAYVERSE" }, { name: "description", content: "Global and friends leaderboards for every sport." },
    { property: "og:title", content: "Rankings — PLAYVERSE" }, { property: "og:description", content: "Global and friends leaderboards for every sport." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Rankings" description="Global and friends leaderboards for every sport.">
      <EmptyState icon={<Crown />} title="Leaderboards are empty" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
