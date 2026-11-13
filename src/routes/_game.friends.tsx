import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_game/friends")({
  head: () => ({ meta: [
    { title: "Friends — PLAYVERSE" }, { name: "description", content: "Add friends, see who is online and build rivalries." },
    { property: "og:title", content: "Friends — PLAYVERSE" }, { property: "og:description", content: "Add friends, see who is online and build rivalries." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Friends" description="Add friends, see who is online and build rivalries.">
      <EmptyState icon={<Users />} title="No friends yet" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
