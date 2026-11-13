import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_game/privacy")({
  head: () => ({ meta: [
    { title: "Privacy policy — PLAYVERSE" }, { name: "description", content: "How PLAYVERSE handles your data. Right now everything stays on your device." },
    { property: "og:title", content: "Privacy policy — PLAYVERSE" }, { property: "og:description", content: "How PLAYVERSE handles your data. Right now everything stays on your device." },
  ] }),
  component: Page,
});

function Page() {
  return (
    <PageShell title="Privacy policy" description="How PLAYVERSE handles your data. Right now everything stays on your device.">
      <EmptyState icon={<ShieldCheck />} title="Device-only data" description="This fills up once accounts and online matches go live in a later update. Nothing here is faked."
        action={<GameButton asChild variant="hot"><Link to="/sports">Explore sports</Link></GameButton>} />
    </PageShell>
  );
}
