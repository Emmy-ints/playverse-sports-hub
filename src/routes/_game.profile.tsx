import { createFileRoute, Link } from "@tanstack/react-router";
import { DivisionBadge } from "@/components/game/DivisionBadge";
import { Copy } from "lucide-react";
import { useState } from "react";
import { Avatar3D } from "@/components/game/Avatar3D";
import { GameButton } from "@/components/game/GameButton";
import { GlassPanel } from "@/components/game/GlassPanel";
import { PageShell } from "@/components/game/PageShell";
import { XPBar } from "@/components/game/XPBar";
import { xpForNextLevel, xpIntoLevel } from "@/lib/guest-profile";
import { usePlayer } from "@/lib/player";
import { usePlayerStats } from "@/lib/player-stats";
import { useSession } from "@/lib/session";
import { SPORTS } from "@/lib/sports";

export const Route = createFileRoute("/_game/profile")({
  head: () => ({
    meta: [
      { title: "Profile — PLAYVERSE" },
      { name: "description", content: "Your player card and progress." },
      { property: "og:title", content: "Profile — PLAYVERSE" },
      { property: "og:description", content: "Your player card and progress." },
    ],
  }),
  component: Profile,
});

function Profile() {
  const p = usePlayer();
  const { session } = useSession();
  const statsQuery = usePlayerStats(p.isGuest ? null : (session?.user.id ?? null));
  const [copied, setCopied] = useState(false);

  const copyId = async () => {
    if (!p.publicId) return;
    try {
      await navigator.clipboard.writeText(p.publicId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable; ID is still visible */
    }
  };

  return (
    <PageShell
      eyebrow={p.isGuest ? "Guest player" : `@${p.username ?? ""}`}
      title={p.name}
      actions={
        <>
          <GameButton asChild variant="hot"><Link to="/character">{p.avatar ? "Edit character" : "Create character"}</Link></GameButton>
          {p.isGuest && <GameButton asChild variant="primary"><Link to="/register">Create account</Link></GameButton>}
        </>
      }
    >
      <div className="grid gap-5 md:grid-cols-[18rem_1fr]">
        <GlassPanel className="h-80">
          {p.avatar ? <Avatar3D config={p.avatar} interactive /> : <p className="text-muted-foreground">No character yet.</p>}
        </GlassPanel>
        <div className="space-y-5">
          <GlassPanel>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-display text-2xl font-bold">Level {p.level}</p>
              {p.publicId && (
                <button onClick={copyId} className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 font-mono text-sm" aria-label="Copy player ID">
                  {p.publicId} <Copy className="size-3.5" aria-hidden /> {copied && <span className="font-sans text-xs text-success">Copied</span>}
                </button>
              )}
            </div>
            <XPBar xp={xpIntoLevel(p.xp, p.level)} max={xpForNextLevel(p.level)} className="mt-2" />
            {p.isGuest && (
              <p className="mt-4 text-sm text-muted-foreground">
                Guest progress stays on this device. Create an account to save it, add friends and play online.
              </p>
            )}
          </GlassPanel>

          {!p.isGuest && (
            <GlassPanel>
              <h2 className="text-2xl font-bold uppercase">Sports record</h2>
              {statsQuery.isLoading && <p className="mt-2 text-sm text-muted-foreground">Loading…</p>}
              {statsQuery.isError && <p className="mt-2 text-sm text-destructive">Couldn't load your stats. Try again later.</p>}
              {statsQuery.data && (
                <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                  {SPORTS.map((s) => {
                    const st = statsQuery.data.stats.find((r) => r.sport === s.id);
                    const rt = statsQuery.data.ratings.find((r) => r.scope === s.id);
                    return (
                      <li key={s.id} className="rounded-xl bg-secondary/60 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-display text-lg font-bold uppercase">{s.name}</p>
                          {rt && <DivisionBadge rating={rt.rating} games={rt.games_rated} progress />}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {st ? `${st.wins}W · ${st.losses}L${st.draws ? ` · ${st.draws}D` : ""} · ${st.matches_played} played` : "No data"}
                        </p>
                        <p className="text-sm">
                          Rating <span className="font-display font-bold">{rt?.rating ?? "—"}</span>
                          {rt && rt.games_rated === 0 && <span className="text-muted-foreground"> (unrated)</span>}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              )}
            </GlassPanel>
          )}
        </div>
      </div>
    </PageShell>
  );
}
