import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { Bell } from "lucide-react";

export const Route = createFileRoute("/_game/notifications")({
  head: () => ({ meta: [
    { title: "Notifications — PLAYVERSE" }, { name: "description", content: "Challenges, results and friend requests." },
    { property: "og:title", content: "Notifications — PLAYVERSE" }, { property: "og:description", content: "Challenges, results and friend requests." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Notifications" description="Challenges, results and friend requests.">
      <EmptyState icon={<Bell />} title="You're all caught up" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
