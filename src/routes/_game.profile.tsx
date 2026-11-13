import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { GlassPanel } from "@/components/game/GlassPanel";
import { GameButton } from "@/components/game/GameButton";
import { AvatarPreview } from "@/components/game/AvatarPreview";
import { XPBar } from "@/components/game/XPBar";
import { avatarStore } from "@/lib/avatar";
import { guestStore, xpForNextLevel } from "@/lib/guest-profile";

export const Route = createFileRoute("/_game/profile")({
  head: () => ({ meta: [{ title: "Profile — PLAYVERSE" }, { name: "description", content: "Your player card and progress." }, { property: "og:title", content: "Profile — PLAYVERSE" }, { property: "og:description", content: "Your player card and progress." }] }),
  component: Profile,
});

function Profile() {
  const a = avatarStore.useValue();
  const g = guestStore.useValue();
  return (
    <PageShell eyebrow="Guest player" title={a?.nickname ?? "Guest"} actions={<GameButton asChild variant="hot"><Link to="/character">{a ? "Edit character" : "Create character"}</Link></GameButton>}>
      <div className="grid gap-5 md:grid-cols-[18rem_1fr]">
        <GlassPanel className="h-80">{a ? <AvatarPreview config={a} /> : <p className="text-muted-foreground">No character yet.</p>}</GlassPanel>
        <GlassPanel>
          <p className="font-display text-2xl font-bold">Level {g.level}</p>
          <XPBar xp={g.xp} max={xpForNextLevel(g.level)} className="mt-2" />
          <p className="mt-4 text-sm text-muted-foreground">0 matches played. Stats appear after your first match.</p>
        </GlassPanel>
      </div>
    </PageShell>
  );
}
