import { createFileRoute, Link } from "@tanstack/react-router";
import { DivisionBadge } from "@/components/game/DivisionBadge";
import { useQuery } from "@tanstack/react-query";
import { Ban, Loader2, Medal, UserPlus } from "lucide-react";
import { Avatar3D } from "@/components/game/Avatar3D";
import { ChallengeButton } from "@/components/game/ChallengeDialog";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { GlassPanel } from "@/components/game/GlassPanel";
import { PageShell } from "@/components/game/PageShell";
import { PresenceDot } from "@/components/game/PresenceDot";
import { ReportButton } from "@/components/game/ReportDialog";
import { RequireAccount } from "@/components/game/RequireAccount";
import { usePlayerStats } from "@/lib/player-stats";
import { useSession } from "@/lib/session";
import { useBlockPlayer, useFriendRequests, useFriends, usePlayerByUsername, useSendFriendRequest, type PlayerSummary } from "@/lib/social";
import { SPORTS } from "@/lib/sports";
import { getSupabase } from "@/lib/supabase";

export const Route = createFileRoute("/_game/players/$username")({
  head: ({ params }) => ({
    meta: [
      { title: `@${params.username} — PLAYVERSE` },
      { name: "description", content: `Player profile for @${params.username} on PLAYVERSE.` },
      { property: "og:title", content: `@${params.username} — PLAYVERSE` },
      { property: "og:description", content: `Player profile for @${params.username} on PLAYVERSE.` },
    ],
  }),
  component: PlayerPage,
});

function PlayerPage() {
  const { username } = Route.useParams();
  return (
    <RequireAccount feature="Player profiles">
      <PlayerProfile username={username} />
    </RequireAccount>
  );
}

function PlayerProfile({ username }: { username: string }) {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const player = usePlayerByUsername(username);
  const p = player.data ?? null;
  const stats = usePlayerStats(p?.id ?? null);
  const achievements = useQuery({
    queryKey: ["player-achievements", p?.id],
    enabled: !!p,
    queryFn: async () => {
      const { data, error } = await getSupabase()!
        .from("player_achievements")
        .select("earned_at, achievements(id, name, description)")
        .eq("player_id", p!.id)
        .order("earned_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as { earned_at: string; achievements: { id: string; name: string; description: string } | null }[];
    },
  });

  if (player.isLoading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (!p) {
    return (
      <PageShell title="Player not found">
        <EmptyState icon={<UserPlus />} title="No such player" description={`There's no player called @${username}.`} action={<GameButton asChild variant="hot"><Link to="/friends">Find players</Link></GameButton>} />
      </PageShell>
    );
  }

  const summary: PlayerSummary = { id: p.id, username: p.username, display_name: p.display_name, public_id: p.public_id, level: p.level, avatar_config: p.avatar_config };
  const isMe = p.id === me;
  const totals = (stats.data?.stats ?? []).reduce((t, s) => ({ w: t.w + s.wins, l: t.l + s.losses, n: t.n + s.matches_played }), { w: 0, l: 0, n: 0 });

  return (
    <PageShell
      eyebrow={`@${p.username} · ${p.public_id}`}
      title={p.display_name}
      actions={isMe ? <GameButton asChild variant="glass"><Link to="/profile">This is you</Link></GameButton> : <Relationship player={summary} />}
    >
      <div className="grid gap-5 md:grid-cols-[18rem_1fr]">
        <GlassPanel className="flex h-80 flex-col">
          <div className="min-h-0 flex-1">{p.avatar_config ? <Avatar3D config={p.avatar_config} interactive /> : <p className="text-muted-foreground">No character yet.</p>}</div>
          <div className="flex items-center justify-between pt-2">
            <span className="font-display text-xl font-bold">Level {p.level}</span>
            <PresenceDot userId={p.id} withLabel />
          </div>
        </GlassPanel>
        <div className="space-y-5">
          <GlassPanel>
            <h2 className="text-2xl font-bold uppercase">Record</h2>
            <p className="text-sm text-muted-foreground">
              {totals.n === 0 ? "No matches played yet." : `${totals.w} wins · ${totals.l} losses · ${totals.n} played`}
            </p>
            {stats.data && (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {SPORTS.map((s) => {
                  const st = stats.data.stats.find((r) => r.sport === s.id);
                  const rt = stats.data.ratings.find((r) => r.scope === s.id);
                  return (
                    <li key={s.id} className="rounded-xl bg-secondary/60 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-display text-lg font-bold uppercase">{s.name}</p>
                        {rt && <DivisionBadge rating={rt.rating} games={rt.games_rated} />}
                      </div>
                      <p className="text-sm text-muted-foreground">{st ? `${st.wins}W · ${st.losses}L` : "—"} · Rating {rt?.rating ?? "—"}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassPanel>
          <GlassPanel>
            <h2 className="text-2xl font-bold uppercase">Achievements</h2>
            {achievements.data && achievements.data.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-2">
                {achievements.data.map((a) => (
                  <li key={a.achievements?.id ?? a.earned_at} className="inline-flex items-center gap-1.5 rounded-full bg-gold/15 px-3 py-1 text-sm text-gold" title={a.achievements?.description}>
                    <Medal className="size-4" aria-hidden /> {a.achievements?.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">None earned yet.</p>
            )}
          </GlassPanel>
          <GlassPanel>
            <h2 className="text-2xl font-bold uppercase">Recent matches</h2>
            <p className="text-sm text-muted-foreground">Verified match history appears once online matches are live.</p>
          </GlassPanel>
        </div>
      </div>
    </PageShell>
  );
}

function Relationship({ player }: { player: PlayerSummary }) {
  const friends = useFriends();
  const requests = useFriendRequests();
  const send = useSendFriendRequest();
  const block = useBlockPlayer();
  const isFriend = friends.data?.some((f) => f.id === player.id) ?? false;
  const pending = requests.data?.find((r) => r.player.id === player.id);

  return (
    <>
      {isFriend ? (
        <ChallengeButton player={player} size="md" />
      ) : pending ? (
        <span className="glass inline-flex h-11 items-center rounded-xl px-4 text-sm font-semibold">{pending.incoming ? "Wants to be friends — see Requests" : "Request sent"}</span>
      ) : (
        <GameButton variant="primary" disabled={send.isPending} onClick={() => send.mutate(player.id)}>
          <UserPlus aria-hidden /> {send.isSuccess ? "Sent" : "Add friend"}
        </GameButton>
      )}
      <GameButton
        variant="ghost"
        size="sm"
        disabled={block.isPending}
        onClick={() => confirm(`Block ${player.display_name}? This removes them as a friend and cancels pending requests and challenges.`) && block.mutate(player.id)}
      >
        <Ban aria-hidden /> {block.isSuccess ? "Blocked" : "Block"}
      </GameButton>
      <ReportButton player={player} />
      {(send.error ?? block.error) && <p role="alert" className="w-full text-sm text-destructive">{(send.error ?? block.error)?.message}</p>}
    </>
  );
}
