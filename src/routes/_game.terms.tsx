import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { Scale } from "lucide-react";

export const Route = createFileRoute("/_game/terms")({
  head: () => ({ meta: [
    { title: "Terms & competitive rules — PLAYVERSE" }, { name: "description", content: "Fair play rules and terms of use for PLAYVERSE." },
    { property: "og:title", content: "Terms & competitive rules — PLAYVERSE" }, { property: "og:description", content: "Fair play rules and terms of use for PLAYVERSE." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Terms & competitive rules" description="Fair play rules and terms of use for PLAYVERSE.">
      <EmptyState icon={<Scale />} title="Rules are being finalised" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
