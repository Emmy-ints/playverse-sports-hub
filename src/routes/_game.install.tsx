import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { GlassPanel } from "@/components/game/GlassPanel";

export const Route = createFileRoute("/_game/install")({
  head: () => ({ meta: [{ title: "Install — PLAYVERSE" }, { name: "description", content: "Add PLAYVERSE to your home screen." }, { property: "og:title", content: "Install — PLAYVERSE" }, { property: "og:description", content: "Add PLAYVERSE to your home screen." }] }),
  component: () => (
    <PageShell title="Install PLAYVERSE" description="Add it to your home screen for a full-screen app experience.">
      <div className="grid gap-4 md:grid-cols-3">
        <GlassPanel><h2 className="text-2xl font-bold uppercase">iPhone</h2><p className="text-sm text-muted-foreground">Open in Safari → Share → Add to Home Screen.</p></GlassPanel>
        <GlassPanel><h2 className="text-2xl font-bold uppercase">Android</h2><p className="text-sm text-muted-foreground">Open in Chrome → ⋮ menu → Install app.</p></GlassPanel>
        <GlassPanel><h2 className="text-2xl font-bold uppercase">Desktop</h2><p className="text-sm text-muted-foreground">Click the install icon in the address bar.</p></GlassPanel>
      </div>
    </PageShell>
  ),
});
