import { createFileRoute } from "@tanstack/react-router";
import { GlassPanel } from "@/components/game/GlassPanel";
import { PageShell } from "@/components/game/PageShell";

export const Route = createFileRoute("/_game/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — PLAYVERSE" },
      { name: "description", content: "How PLAYVERSE handles your data." },
      { property: "og:title", content: "Privacy policy — PLAYVERSE" },
      { property: "og:description", content: "How PLAYVERSE handles your data." },
    ],
  }),
  component: Privacy,
});

const SECTIONS = [
  {
    title: "What we store today",
    body: "Right now PLAYVERSE has no accounts or online services. Your guest character, progress and settings are saved only in this browser's local storage on your device. Nothing is sent to our servers.",
  },
  {
    title: "Deleting your data",
    body: "Go to Settings → Reset guest data, or clear this site's data in your browser. Either removes everything PLAYVERSE has stored on this device.",
  },
  {
    title: "When accounts launch",
    body: "Accounts will store your email, username, character, friends, match results, ratings and achievements so you can play across devices. Passwords are never stored in plain text. We will not sell your data. This policy will be updated before any of that goes live.",
  },
  {
    title: "Fair-play data",
    body: "Once online matches launch, match events are logged on our servers so results can be verified and cheating reports can be reviewed fairly.",
  },
  {
    title: "Children",
    body: "PLAYVERSE accounts will not be offered to children under 13. Where local law sets a higher age, that age applies.",
  },
];

function Privacy() {
  return (
    <PageShell eyebrow="Last updated November 2026" title="Privacy policy" description="Plain-language summary of how PLAYVERSE handles your data.">
      <div className="space-y-4">
        {SECTIONS.map((s) => (
          <GlassPanel key={s.title}>
            <h2 className="text-2xl font-bold uppercase">{s.title}</h2>
            <p className="mt-1 text-muted-foreground">{s.body}</p>
          </GlassPanel>
        ))}
      </div>
    </PageShell>
  );
}
