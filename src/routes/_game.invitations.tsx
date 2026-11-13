import { createFileRoute, Link } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";

export const Route = createFileRoute("/_game/invitations")({
  head: () => ({
    meta: [
      { title: "Match invitations — PLAYVERSE" },
      { name: "description", content: "Challenges sent to you by other players." },
      { property: "og:title", content: "Match invitations — PLAYVERSE" },
      { property: "og:description", content: "Challenges sent to you by other players." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Match invitations" description="Challenges sent to you by other players.">
      <RequireAccount feature="Match invitations">
        <EmptyState
          icon={<Swords />}
          title="No invitations"
          description="Challenges from other players will appear here."
          action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>}
        />
      </RequireAccount>
    </PageShell>
  );
}
