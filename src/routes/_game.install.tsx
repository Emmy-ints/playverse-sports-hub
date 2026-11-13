import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Download, Monitor, Smartphone } from "lucide-react";
import { useState } from "react";
import { GameButton } from "@/components/game/GameButton";
import { GlassPanel } from "@/components/game/GlassPanel";
import { PageShell } from "@/components/game/PageShell";
import { promptInstall, useInstallState } from "@/lib/install";

export const Route = createFileRoute("/_game/install")({
  head: () => ({ meta: [{ title: "Install — PLAYVERSE" }, { name: "description", content: "Add PLAYVERSE to your home screen." }, { property: "og:title", content: "Install — PLAYVERSE" }, { property: "og:description", content: "Add PLAYVERSE to your home screen." }] }),
  component: Page,
});

function Page() {
  const state = useInstallState();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <PageShell title="Install PLAYVERSE" description="Full-screen app on your phone, tablet or computer — opens instantly, even on a weak connection.">
      <GlassPanel className="mb-6 flex flex-col items-center gap-3 py-8 text-center">
        <img src="/icon-192.png" alt="" width={96} height={96} className="rounded-3xl shadow-xl" />
        {state === "installed" ? (
          <p className="flex items-center gap-2 font-display text-2xl font-bold uppercase text-success"><CheckCircle2 aria-hidden /> Installed</p>
        ) : state === "available" ? (
          <GameButton variant="hot" size="lg" onClick={async () => setMsg((await promptInstall()) ? "Installed — find PLAYVERSE on your home screen." : "No problem — you can install it any time.")}>
            <Download aria-hidden /> Install app
          </GameButton>
        ) : (
          <p className="max-w-md text-sm text-muted-foreground">Your browser doesn't offer a one-tap install here. Use the steps below for your device.</p>
        )}
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </GlassPanel>
      <div className="grid gap-4 md:grid-cols-3">
        <GlassPanel><h2 className="flex items-center gap-2 text-2xl font-bold uppercase"><Smartphone className="size-5" aria-hidden /> iPhone & iPad</h2><p className="text-sm text-muted-foreground">Open in Safari → tap Share → Add to Home Screen.</p></GlassPanel>
        <GlassPanel><h2 className="flex items-center gap-2 text-2xl font-bold uppercase"><Smartphone className="size-5" aria-hidden /> Android</h2><p className="text-sm text-muted-foreground">Tap Install app above, or Chrome ⋮ menu → Install app.</p></GlassPanel>
        <GlassPanel><h2 className="flex items-center gap-2 text-2xl font-bold uppercase"><Monitor className="size-5" aria-hidden /> Desktop</h2><p className="text-sm text-muted-foreground">Click Install app above, or the install icon in Chrome/Edge's address bar.</p></GlassPanel>
      </div>
    </PageShell>
  );
}
