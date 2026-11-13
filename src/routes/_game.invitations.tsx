import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Loader2, Swords, X } from "lucide-react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { PlayerRow } from "@/components/game/PlayerRow";
import { RequireAccount } from "@/components/game/RequireAccount";
import { describeConfig } from "@/lib/match-config";
import { useCancelInvitation, useInvitations, useRespondInvitation, type InvitationView } from "@/lib/social";
import { getSport } from "@/lib/sports";
import { formatCountdown, timeAgo, useNow } from "@/lib/time";

export const Route = createFileRoute("/_game/invitations")({
  head: () => ({
    meta: [
      { title: "Match invitations — PLAYVERSE" },
      { name: "description", content: "Challenges you've sent and received." },
      { property: "og:title", content: "Match invitations — PLAYVERSE" },
      { property: "og:description", content: "Challenges you've sent and received." },
    ],
  }),
  component: InvitationsPage,
});

function InvitationsPage() {
  return (
    <PageShell title="Match invitations" description="Challenges you've sent and received. Each one expires after 10 minutes.">
      <RequireAccount feature="Match invitations">
        <InvitationList />
      </RequireAccount>
    </PageShell>
  );
}

function InvitationList() {
  const invitations = useInvitations();
  const now = useNow();
  if (invitations.isLoading) {
    return (
      <div className="flex justify-center py-12" role="status" aria-label="Loading">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (invitations.isError) return <p role="alert" className="text-sm text-destructive">Couldn't load invitations.</p>;
  const all = (invitations.data ?? []).map((i) => (i.status === "pending" && new Date(i.expires_at).getTime() <= now ? { ...i, status: "expired" } : i));
  const pending = all.filter((i) => i.status === "pending");
  const recent = all.filter((i) => i.status !== "pending").slice(0, 10);

  if (all.length === 0) {
    return (
      <EmptyState
        icon={<Swords />}
        title="No invitations"
        description="Challenge a friend from your Friends list, or wait for someone to challenge you."
        action={<GameButton asChild variant="hot"><Link to="/friends">Go to friends</Link></GameButton>}
      />
    );
  }
  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-2 text-xl font-bold uppercase">Pending</h2>
        {pending.length === 0 ? <p className="text-sm text-muted-foreground">Nothing pending.</p> : (
          <ul className="space-y-2">{pending.map((i) => <InvitationRow key={i.id} inv={i} now={now} />)}</ul>
        )}
      </section>
      {recent.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl font-bold uppercase">Recent</h2>
          <ul className="space-y-2">{recent.map((i) => <InvitationRow key={i.id} inv={i} now={now} />)}</ul>
        </section>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { accepted: "Accepted", declined: "Declined", expired: "Expired", cancelled: "Cancelled" };

function InvitationRow({ inv, now }: { inv: InvitationView; now: number }) {
  const navigate = useNavigate();
  const respond = useRespondInvitation();
  const cancel = useCancelInvitation();
  const sport = getSport(inv.sport);
  const left = new Date(inv.expires_at).getTime() - now;

  const actions =
    inv.status === "pending" ? (
      inv.incoming ? (
        <>
          <GameButton
            size="sm"
            variant="hot"
            disabled={respond.isPending}
            onClick={() =>
              respond.mutate(
                { id: inv.id, accept: true },
                { onSuccess: (matchId) => matchId && navigate({ to: "/lobby/$matchId", params: { matchId } }) },
              )
            }
          >
            <Check aria-hidden /> Accept
          </GameButton>
          <GameButton size="sm" variant="glass" disabled={respond.isPending} onClick={() => respond.mutate({ id: inv.id, accept: false })}>
            <X aria-hidden /> Decline
          </GameButton>
        </>
      ) : (
        <GameButton size="sm" variant="glass" disabled={cancel.isPending} onClick={() => cancel.mutate(inv.id)}>
          Cancel
        </GameButton>
      )
    ) : inv.status === "accepted" && inv.match_id ? (
      <GameButton asChild size="sm" variant="primary">
        <Link to="/lobby/$matchId" params={{ matchId: inv.match_id }}>Open lobby</Link>
      </GameButton>
    ) : (
      <span className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground">{STATUS_LABEL[inv.status] ?? inv.status}</span>
    );

  return (
    <div>
      <p className="mb-1 flex flex-wrap gap-x-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-accent">{inv.incoming ? "From" : "To"}</span>
        <span>{sport?.name ?? inv.sport} · {describeConfig(inv.sport, inv.config)}</span>
        {inv.status === "pending" ? <span>Expires in {formatCountdown(left)}</span> : <span>{timeAgo(inv.created_at, now)}</span>}
      </p>
      <ul>
        <PlayerRow player={inv.player} actions={actions} />
      </ul>
      {inv.config.rules && <p className="mt-1 px-3 text-sm italic text-muted-foreground">Rules: “{inv.config.rules}”</p>}
      {(respond.error ?? cancel.error) && <p role="alert" className="mt-1 text-sm text-destructive">{(respond.error ?? cancel.error)?.message}</p>}
    </div>
  );
}
