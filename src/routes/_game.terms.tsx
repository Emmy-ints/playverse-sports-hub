import { createFileRoute } from "@tanstack/react-router";
import { GlassPanel } from "@/components/game/GlassPanel";
import { PageShell } from "@/components/game/PageShell";

export const Route = createFileRoute("/_game/terms")({
  head: () => ({
    meta: [
      { title: "Terms & competitive rules — PLAYVERSE" },
      { name: "description", content: "Fair play rules and terms of use for PLAYVERSE." },
      { property: "og:title", content: "Terms & competitive rules — PLAYVERSE" },
      { property: "og:description", content: "Fair play rules and terms of use for PLAYVERSE." },
    ],
  }),
  component: Terms,
});

const RULES = [
  { title: "Play fair", body: "No cheats, bots, modified clients, exploits, input automation or deliberate disconnects to avoid a loss." },
  { title: "The server decides", body: "Scores, winners, XP, ratings and rewards are calculated by PLAYVERSE servers. Results produced on a player's device are never trusted for competition." },
  { title: "No pay-to-win", body: "Cosmetics such as outfits, bowling balls, golf skins and car paint never change how you perform." },
  { title: "Respect other players", body: "No harassment, hate speech, threats, spam or impersonation. Use Block and Report if someone breaks these rules." },
  { title: "One player, one account", body: "Don't share accounts, trade accounts, or use extra accounts to boost rankings." },
  { title: "Enforcement", body: "Suspected cheating is reviewed using match evidence before action is taken. Penalties range from warnings to suspension, and you can appeal." },
  { title: "The service", body: "PLAYVERSE is in early development. Features may change and data may be reset before official launch." },
];

function Terms() {
  return (
    <PageShell eyebrow="Last updated November 2026" title="Terms & competitive rules" description="By playing PLAYVERSE you agree to these rules.">
      <ol className="space-y-4">
        {RULES.map((r, i) => (
          <li key={r.title}>
            <GlassPanel>
              <h2 className="text-2xl font-bold uppercase">
                <span className="text-accent">{i + 1}.</span> {r.title}
              </h2>
              <p className="mt-1 text-muted-foreground">{r.body}</p>
            </GlassPanel>
          </li>
        ))}
      </ol>
    </PageShell>
  );
}
