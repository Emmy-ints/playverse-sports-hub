import { createFileRoute, Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";

export const Route = createFileRoute("/_game/friends")({
  head: () => ({
    meta: [
      { title: "Friends — PLAYVERSE" },
      { name: "description", content: "Add friends, see who is online and build rivalries." },
      { property: "og:title", content: "Friends — PLAYVERSE" },
      { property: "og:description", content: "Add friends, see who is online and build rivalries." },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Friends" description="Add friends, see who is online and build rivalries.">
      <RequireAccount feature="Friends">
        <EmptyState
          icon={<Users />}
          title="No friends yet"
          description="Friend search, requests and online status arrive in the next update."
          action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>}
        />
      </RequireAccount>
    </PageShell>
  );
}
