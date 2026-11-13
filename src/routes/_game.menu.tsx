import { createFileRoute, Link } from "@tanstack/react-router";
import { PageShell } from "@/components/game/PageShell";
import { SECONDARY_NAV } from "@/components/game/nav-items";

export const Route = createFileRoute("/_game/menu")({
  head: () => ({ meta: [{ title: "Menu — PLAYVERSE" }, { name: "description", content: "All PLAYVERSE sections." }, { property: "og:title", content: "Menu — PLAYVERSE" }, { property: "og:description", content: "All PLAYVERSE sections." }] }),
  component: () => (
    <PageShell title="More">
      <ul className="grid gap-2 sm:grid-cols-2">
        {[...SECONDARY_NAV, { to: "/privacy" as const, label: "Privacy policy" }, { to: "/terms" as const, label: "Terms & rules" }].map((i) => (
          <li key={i.to}><Link to={i.to} className="glass flex h-14 items-center rounded-xl px-4 font-semibold transition-transform active:scale-95">{i.label}</Link></li>
        ))}
      </ul>
    </PageShell>
  ),
});
