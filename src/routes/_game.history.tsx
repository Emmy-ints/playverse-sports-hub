import { createFileRoute, Link } from "@tanstack/react-router";
import { History } from "lucide-react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";

export const Route = createFileRoute("/_game/history")({
  head: () => ({
    meta: [
      { title: "Match history — PLAYVERSE" },
      { name: "description", content: "Every match you have played across all four sports." },
      { property: "og:title", content: "Match history — PLAYVERSE" },
      { property: "og:description", content: "Every match you have played across all four sports." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Match history" description="Every match you have played across all four sports.">
      <RequireAccount feature="Match history">
        <EmptyState
          icon={<History />}
          title="No matches played"
          description="Your completed matches will appear here."
          action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>}
        />
      </RequireAccount>
    </PageShell>
  );
}
