import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ControlsCard, type GuideSport } from "@/components/game/ControlsGuide";
import { GameButton } from "@/components/game/GameButton";
import { GlassPanel } from "@/components/game/GlassPanel";
import { PageShell } from "@/components/game/PageShell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/help")({
  head: () => ({ meta: [
    { title: "Help & support — PLAYVERSE" }, { name: "description", content: "How to play every sport, online matches, accounts and installing PLAYVERSE." },
    { property: "og:title", content: "Help & support — PLAYVERSE" }, { property: "og:description", content: "How to play every sport, online matches, accounts and installing PLAYVERSE." },
  ] }),
  component: Page,
});

const SPORTS: { id: GuideSport; name: string }[] = [
  { id: "tennis", name: "Tennis" },
  { id: "racing", name: "Racing" },
  { id: "bowling", name: "Bowling" },
  { id: "golf", name: "Golf" },
  { id: "athletics", name: "Athletics" },
  { id: "parkour", name: "Parkour" },
];

const FAQ: { q: string; a: string }[] = [
  { q: "How do I play someone online?", a: "Add them as a friend, then challenge them from Friends or a sport page. When they accept, you both meet in the lobby, press \"I'm ready\" and the match starts after a short countdown." },
  { q: "Are online results real?", a: "Yes. Every online match is played and scored on the PLAYVERSE servers, not on your device, so results, ratings and XP can't be faked." },
  { q: "What happens if I lose connection?", a: "Open the match lobby again and press Rejoin. In live games (tennis, racing, athletics, parkour), if you stay away too long the match is awarded to your opponent." },
  { q: "Do practice games count?", a: "No. Practice is for learning and fun: nothing is ranked or saved." },
  { q: "It runs slowly on my phone.", a: "Tap the screen/monitor icon in any game to switch to Lite graphics." },
  { q: "Can I install it like an app?", a: "Yes, from the Install page. It then opens full-screen from your home screen." },
];

function Page() {
  const [sport, setSport] = useState<GuideSport>("tennis");
  return (
    <PageShell title="Help & support" description="How to play every sport, online matches, accounts and installing PLAYVERSE.">
      <h2 className="font-display text-2xl font-black uppercase">Controls</h2>
      <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Sport">
        {SPORTS.map((s) => (
          <button key={s.id} type="button" role="tab" aria-selected={sport === s.id} onClick={() => setSport(s.id)}
            className={cn("rounded-full px-4 py-2 text-sm font-bold uppercase transition-colors", sport === s.id ? "bg-gradient-hot text-accent-foreground" : "bg-secondary hover:bg-secondary/70")}>
            {s.name}
          </button>
        ))}
      </div>
      <ControlsCard key={sport} sport={sport} className="mt-4 max-w-2xl" />

      <h2 className="mt-10 font-display text-2xl font-black uppercase">Questions</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {FAQ.map((f) => (
          <GlassPanel key={f.q}>
            <p className="font-bold">{f.q}</p>
            <p className="mt-1 text-sm text-muted-foreground">{f.a}</p>
          </GlassPanel>
        ))}
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        <GameButton asChild variant="hot"><Link to="/sports">Play a sport</Link></GameButton>
        <GameButton asChild variant="glass"><Link to="/install">Install the app</Link></GameButton>
      </div>
    </PageShell>
  );
}
