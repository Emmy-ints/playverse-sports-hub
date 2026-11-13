import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_game/help")({
  head: () => ({ meta: [
    { title: "Help & support — PLAYVERSE" }, { name: "description", content: "Answers about playing, accounts and installing PLAYVERSE." },
    { property: "og:title", content: "Help & support — PLAYVERSE" }, { property: "og:description", content: "Answers about playing, accounts and installing PLAYVERSE." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Help & support" description="Answers about playing, accounts and installing PLAYVERSE.">
      <EmptyState icon={<HelpCircle />} title="Help center coming soon" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
