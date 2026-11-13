import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { Swords } from "lucide-react";

export const Route = createFileRoute("/_game/invitations")({
  head: () => ({ meta: [
    { title: "Match invitations — PLAYVERSE" }, { name: "description", content: "Challenges sent to you by other players." },
    { property: "og:title", content: "Match invitations — PLAYVERSE" }, { property: "og:description", content: "Challenges sent to you by other players." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Match invitations" description="Challenges sent to you by other players.">
      <EmptyState icon={<Swords />} title="No invitations" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
