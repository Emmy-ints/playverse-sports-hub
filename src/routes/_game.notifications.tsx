import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";

export const Route = createFileRoute("/_game/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — PLAYVERSE" },
      { name: "description", content: "Challenges, results and friend requests." },
      { property: "og:title", content: "Notifications — PLAYVERSE" },
      { property: "og:description", content: "Challenges, results and friend requests." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Notifications" description="Challenges, results and friend requests.">
      <RequireAccount feature="Notifications">
        <EmptyState
          icon={<Bell />}
          title="You're all caught up"
          description="You have no notifications yet."
          action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>}
        />
      </RequireAccount>
    </PageShell>
  );
}
