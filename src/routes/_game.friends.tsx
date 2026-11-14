import { createFileRoute } from "@tanstack/react-router";
import { Check, Loader2, Search, ShieldOff, UserMinus, UserPlus, Users, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { ChallengeButton } from "@/components/game/ChallengeDialog";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { PlayerRow } from "@/components/game/PlayerRow";
import { RequireAccount } from "@/components/game/RequireAccount";
import { PrivateRoomCard } from "@/components/game/PrivateRoom";
import { getSport } from "@/lib/sports";
import { usePresenceMap } from "@/lib/presence";
import {
  useBlocks,
  useCancelFriendRequest,
  useFriendRequests,
  useFriends,
  useRemoveFriend,
  useRespondFriendRequest,
  useSearchPlayers,
  useSendFriendRequest,
  useUnblockPlayer,
  useRecentPlayers,
  type PlayerSummary,
} from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/friends")({
  head: () => ({
    meta: [
      { title: "Friends — PLAYVERSE" },
      { name: "description", content: "Add friends, see who is online and challenge them." },
      { property: "og:title", content: "Friends — PLAYVERSE" },
      { property: "og:description", content: "Add friends, see who is online and challenge them." },
    ],
  }),
  component: FriendsPage,
});

const TABS = ["Friends", "Recent", "Rooms", "Requests", "Find players", "Blocked"] as const;
type Tab = (typeof TABS)[number];

function FriendsPage() {
  const [tab, setTab] = useState<Tab>("Friends");
  return (
    <PageShell title="Friends" description="Add friends, see who is online and challenge them.">
      <RequireAccount feature="Friends">
        <div role="tablist" aria-label="Friends sections" className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={cn(
                "h-10 shrink-0 rounded-xl px-4 font-display text-base font-bold uppercase tracking-wider transition-colors",
                tab === t ? "bg-gradient-primary text-primary-foreground shadow-glow" : "glass text-muted-foreground hover:text-foreground",
              )}
            >
              {t}
              {t === "Requests" && <RequestCount />}
            </button>
          ))}
        </div>
        <div role="tabpanel">
          {tab === "Friends" && <FriendList onFind={() => setTab("Find players")} />}
          {tab === "Recent" && <RecentPlayers />}
          {tab === "Rooms" && <PrivateRoomCard />}
          {tab === "Requests" && <Requests />}
          {tab === "Find players" && <FindPlayers />}
          {tab === "Blocked" && <Blocked />}
        </div>
      </RequireAccount>
    </PageShell>
  );
}

function RequestCount() {
  const { data } = useFriendRequests();
  const n = data?.filter((r) => r.incoming).length ?? 0;
  return n ? <span className="ml-2 rounded-full bg-accent px-1.5 text-xs text-accent-foreground">{n}</span> : null;
}

function Loading() {
  return (
    <div className="flex justify-center py-12" role="status" aria-label="Loading">
      <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
    </div>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return <p role="alert" className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm">{children}</p>;
}

function FriendList({ onFind }: { onFind: () => void }) {
  const friends = useFriends();
  const presence = usePresenceMap();
  const remove = useRemoveFriend();
  if (friends.isLoading) return <Loading />;
  if (friends.isError) return <ErrorNote>Couldn't load your friends. Check your connection.</ErrorNote>;
  const list = friends.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No friends yet"
        description="Find players by username or player ID and send a friend request."
        action={<GameButton variant="hot" onClick={onFind}><Search aria-hidden /> Find players</GameButton>}
      />
    );
  }
  const sorted = [...list].sort((a, b) => Number(presence.has(b.id)) - Number(presence.has(a.id)));
  return (
    <ul className="space-y-2">
      {sorted.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          actions={
            <>
              <ChallengeButton player={p} />
              <GameButton
                variant="ghost"
                size="sm"
                aria-label={`Remove ${p.display_name}`}
                disabled={remove.isPending}
                onClick={() => confirm(`Remove ${p.display_name} from your friends?`) && remove.mutate(p.id)}
              >
                <UserMinus aria-hidden />
              </GameButton>
            </>
          }
        />
      ))}
    </ul>
  );
}

function Requests() {
  const requests = useFriendRequests();
  const respond = useRespondFriendRequest();
  const cancel = useCancelFriendRequest();
  if (requests.isLoading) return <Loading />;
  if (requests.isError) return <ErrorNote>Couldn't load requests.</ErrorNote>;
  const incoming = requests.data?.filter((r) => r.incoming) ?? [];
  const outgoing = requests.data?.filter((r) => !r.incoming) ?? [];
  if (!incoming.length && !outgoing.length) {
    return <EmptyState icon={<UserPlus />} title="No pending requests" description="Friend requests you send or receive show up here." />;
  }
  const err = respond.error ?? cancel.error;
  return (
    <div className="space-y-6">
      {err && <ErrorNote>{err.message}</ErrorNote>}
      {incoming.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl font-bold uppercase">Received</h2>
          <ul className="space-y-2">
            {incoming.map((r) => (
              <PlayerRow
                key={r.id}
                player={r.player}
                actions={
                  <>
                    <GameButton size="sm" variant="primary" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, accept: true })}>
                      <Check aria-hidden /> Accept
                    </GameButton>
                    <GameButton size="sm" variant="glass" disabled={respond.isPending} onClick={() => respond.mutate({ id: r.id, accept: false })}>
                      <X aria-hidden /> Reject
                    </GameButton>
                  </>
                }
              />
            ))}
          </ul>
        </section>
      )}
      {outgoing.length > 0 && (
        <section>
          <h2 className="mb-2 text-xl font-bold uppercase">Sent</h2>
          <ul className="space-y-2">
            {outgoing.map((r) => (
              <PlayerRow
                key={r.id}
                player={r.player}
                actions={
                  <GameButton size="sm" variant="glass" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                    Cancel
                  </GameButton>
                }
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FindPlayers() {
  const [term, setTerm] = useState("");
  const search = useSearchPlayers(term);
  const friends = useFriends();
  const requests = useFriendRequests();
  const send = useSendFriendRequest();
  const [sentTo, setSentTo] = useState<Record<string, string>>({});

  const relation = (p: PlayerSummary): string | null => {
    if (sentTo[p.id]) return sentTo[p.id] ?? null;
    if (friends.data?.some((f) => f.id === p.id)) return "Friends";
    const req = requests.data?.find((r) => r.player.id === p.id);
    if (req) return req.incoming ? "Sent you a request" : "Request sent";
    return null;
  };

  return (
    <div className="space-y-4">
      <label className="relative block">
        <span className="sr-only">Search players</span>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Username or player ID (PV…)"
          autoComplete="off"
          className="h-12 w-full rounded-xl border border-input bg-navy-deep/60 pl-12 pr-4 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
        />
      </label>
      {send.isError && <ErrorNote>{send.error.message}</ErrorNote>}
      {term.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least 2 characters. Your player ID is on your profile.</p>
      ) : search.isLoading ? (
        <Loading />
      ) : search.isError ? (
        <ErrorNote>Search failed. Try again.</ErrorNote>
      ) : (search.data ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No players found.</p>
      ) : (
        <ul className="space-y-2">
          {(search.data ?? []).map((p) => {
            const rel = relation(p);
            return (
              <PlayerRow
                key={p.id}
                player={p}
                actions={
                  rel ? (
                    <span className="rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-muted-foreground">{rel}</span>
                  ) : (
                    <GameButton
                      size="sm"
                      variant="primary"
                      disabled={send.isPending}
                      onClick={() =>
                        send.mutate(p.id, {
                          onSuccess: (res) => setSentTo((m) => ({ ...m, [p.id]: res === "accepted" ? "Friends" : "Request sent" })),
                        })
                      }
                    >
                      <UserPlus aria-hidden /> Add friend
                    </GameButton>
                  )
                }
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Blocked() {
  const blocks = useBlocks();
  const unblock = useUnblockPlayer();
  if (blocks.isLoading) return <Loading />;
  if (blocks.isError) return <ErrorNote>Couldn't load blocked players.</ErrorNote>;
  const list = blocks.data ?? [];
  if (list.length === 0) return <EmptyState icon={<ShieldOff />} title="Nobody blocked" description="Blocked players can't send you requests or challenges." />;
  return (
    <ul className="space-y-2">
      {list.map((p) => (
        <PlayerRow
          key={p.id}
          player={p}
          showPresence={false}
          actions={
            <GameButton size="sm" variant="glass" disabled={unblock.isPending} onClick={() => unblock.mutate(p.id)}>
              Unblock
            </GameButton>
          }
        />
      ))}
    </ul>
  );
}

/** Opponents from finished online matches: rematch them, add them as friends or view their profile. */
function RecentPlayers() {
  const list = useRecentPlayers();
  const send = useSendFriendRequest();
  const [sent, setSent] = useState<Set<string>>(new Set());
  if (list.isLoading) return <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" aria-label="Loading" />;
  if (list.isError) return <p role="alert" className="text-sm text-destructive">Couldn't load recent players.</p>;
  if (!list.data?.length) return <EmptyState icon={<Users />} title="No recent opponents yet" description="Players you meet in online matches and private rooms show up here, so you can find them again." />;
  return (
    <ul className="space-y-2">
      {list.data.map((p) => (
        <PlayerRow key={p.id} player={p} actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {p.games} {p.games === 1 ? "match" : "matches"} · last: {getSport(p.last_sport)?.name ?? p.last_sport} · you {p.my_wins}–{p.their_wins}
            </span>
            {p.is_friend ? <ChallengeButton player={p} /> : sent.has(p.id) ? <span className="text-xs font-bold text-primary">Request sent</span> : (
              <GameButton size="sm" variant="primary" disabled={send.isPending} onClick={() => send.mutate(p.id, { onSuccess: () => setSent((x) => new Set(x).add(p.id)) })}>
                <UserPlus aria-hidden /> Add friend
              </GameButton>
            )}
          </div>
        } />
      ))}
    </ul>
  );
}
