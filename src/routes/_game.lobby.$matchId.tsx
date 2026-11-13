import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, LogOut, Wifi, WifiOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AvatarPreview } from "@/components/game/AvatarPreview";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { GlassPanel } from "@/components/game/GlassPanel";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";
import { describeConfig } from "@/lib/match-config";
import { setActivity } from "@/lib/presence";
import { parseProfile } from "@/lib/profile";
import { useSession } from "@/lib/session";
import { friendlyError, leaveLobby, type PlayerSummary } from "@/lib/social";
import { getSport, type SportId } from "@/lib/sports";
import { getSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/lobby/$matchId")({
  head: () => ({
    meta: [
      { title: "Match lobby — PLAYVERSE" },
      { name: "description", content: "Get ready for your match." },
      { property: "og:title", content: "Match lobby — PLAYVERSE" },
      { property: "og:description", content: "Get ready for your match." },
    ],
  }),
  component: LobbyPage,
});

const COUNTDOWN_SECONDS = 5;

interface LobbyData {
  id: string;
  sport: SportId;
  config: { mode?: string; length?: number; public?: boolean; rules?: string | null };
  status: string;
  players: { slot: number; left: boolean; player: PlayerSummary }[];
}

function LobbyPage() {
  const { matchId } = Route.useParams();
  return (
    <RequireAccount feature="Match lobbies">
      <Lobby matchId={matchId} />
    </RequireAccount>
  );
}

function useLobbyData(matchId: string) {
  return useQuery({
    queryKey: ["lobby", matchId],
    queryFn: async (): Promise<LobbyData | null> => {
      const sb = getSupabase();
      if (!sb) return null;
      const { data: match, error } = await sb.from("matches").select("id, sport, config, status").eq("id", matchId).maybeSingle();
      if (error) throw error;
      if (!match) return null; // not found or not allowed (RLS)
      const { data: parts, error: pErr } = await sb.from("match_participants").select("player_id, slot, left_at").eq("match_id", matchId).order("slot");
      if (pErr) throw pErr;
      const ids = (parts ?? []).map((p) => p.player_id as string);
      const { data: profiles, error: prErr } = await sb.from("profiles").select("id, username, display_name, public_id, level, avatar_config").in("id", ids);
      if (prErr) throw prErr;
      const byId = new Map((profiles ?? []).map((r) => [String(r.id), parseProfile(r)]));
      return {
        id: match.id as string,
        sport: match.sport as SportId,
        config: (match.config ?? {}) as LobbyData["config"],
        status: match.status as string,
        players: (parts ?? []).flatMap((p) => {
          const pr = byId.get(p.player_id as string);
          return pr
            ? [{ slot: p.slot as number, left: !!p.left_at, player: { id: pr.id, username: pr.username, display_name: pr.display_name, public_id: pr.public_id, level: pr.level, avatar_config: pr.avatar_config } }]
            : [];
        }),
      };
    },
  });
}

type PresenceMeta = { user_id: string; ready: boolean };
type ConnState = "connecting" | "connected" | "error" | "closed";

/** Private realtime channel for this match: only active participants may join (enforced by RLS on realtime.messages). */
function useLobbyChannel(matchId: string, me: string | null, enabled: boolean) {
  const [conn, setConn] = useState<ConnState>("connecting");
  const [peers, setPeers] = useState<Map<string, boolean>>(new Map());
  const [ready, setReadyState] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb || !me || !enabled) return undefined;
    let cancelled = false;
    let ch: RealtimeChannel | null = null;

    (async () => {
      await sb.realtime.setAuth();
      if (cancelled) return;
      ch = sb.channel(`lobby:${matchId}`, { config: { private: true, presence: { key: me } } });
      channelRef.current = ch;
      ch.on("presence", { event: "sync" }, () => {
        const state = ch!.presenceState<PresenceMeta>();
        const next = new Map<string, boolean>();
        for (const metas of Object.values(state)) for (const m of metas) next.set(m.user_id, next.get(m.user_id) || m.ready);
        setPeers(next);
      }).subscribe((status) => {
        if (status === "SUBSCRIBED") {
          setConn("connected");
          void ch!.track({ user_id: me, ready: false } satisfies PresenceMeta);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConn("error");
        else if (status === "CLOSED") setConn("closed");
      });
    })();

    return () => {
      cancelled = true;
      channelRef.current = null;
      if (ch) void sb.removeChannel(ch);
    };
  }, [matchId, me, enabled]);

  const setReady = (value: boolean) => {
    setReadyState(value);
    if (channelRef.current && me) void channelRef.current.track({ user_id: me, ready: value } satisfies PresenceMeta);
  };

  return { conn, peers, ready, setReady };
}

function Lobby({ matchId }: { matchId: string }) {
  const { session } = useSession();
  const me = session?.user.id ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const lobby = useLobbyData(matchId);
  const data = lobby.data ?? null;
  const isLive = data?.status === "lobby" && data.players.every((p) => !p.left);
  const { conn, peers, ready, setReady } = useLobbyChannel(matchId, me, !!data && isLive);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // Presence: show friends you're in a lobby.
  useEffect(() => {
    setActivity("in_lobby");
    return () => setActivity(null);
  }, []);

  // Watch for the match closing (e.g. opponent left).
  useEffect(() => {
    const sb = getSupabase();
    if (!sb) return undefined;
    const ch = sb
      .channel(`match-status:${matchId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "matches", filter: `id=eq.${matchId}` }, () => {
        void qc.invalidateQueries({ queryKey: ["lobby", matchId] });
      })
      .subscribe();
    return () => {
      void sb.removeChannel(ch);
    };
  }, [matchId, qc]);

  const players = data?.players ?? [];
  const allConnected = players.length >= 2 && players.every((p) => peers.has(p.player.id));
  const allReady = allConnected && players.every((p) => peers.get(p.player.id) === true);

  // Countdown only runs while everyone is connected and ready; it resets if anyone un-readies or drops.
  useEffect(() => {
    if (!allReady || !isLive) {
      setCountdown(null);
      return undefined;
    }
    setCountdown(COUNTDOWN_SECONDS);
    const t = setInterval(() => setCountdown((c) => (c === null ? null : Math.max(0, c - 1))), 1000);
    return () => clearInterval(t);
  }, [allReady, isLive]);

  const exit = async () => {
    setLeaving(true);
    setLeaveError(null);
    try {
      if (isLive) await leaveLobby(matchId);
      navigate({ to: "/hub" });
    } catch (e) {
      setLeaveError(friendlyError(e));
      setLeaving(false);
    }
  };

  if (lobby.isLoading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading lobby">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (lobby.isError) {
    return <PageShell title="Lobby"><p role="alert" className="text-destructive">Couldn't load this lobby. Check your connection.</p></PageShell>;
  }
  if (!data) {
    return (
      <PageShell title="Lobby not found">
        <EmptyState icon={<LogOut />} title="No access" description="This lobby doesn't exist or you're not part of this match." action={<GameButton asChild variant="hot"><Link to="/invitations">Invitations</Link></GameButton>} />
      </PageShell>
    );
  }

  const sport = getSport(data.sport);
  const closed = !isLive;

  return (
    <PageShell
      eyebrow={`${sport?.venue ?? data.sport} · Private match`}
      title="Match lobby"
      description={`${sport?.name ?? data.sport} · ${describeConfig(data.sport, data.config)}`}
      actions={
        <GameButton variant="glass" onClick={exit} disabled={leaving}>
          <LogOut aria-hidden /> {leaving ? "Leaving…" : closed ? "Back to hub" : "Leave lobby"}
        </GameButton>
      }
    >
      {leaveError && <p role="alert" className="mb-4 text-sm text-destructive">{leaveError}</p>}
      {data.config.rules && <p className="mb-4 text-sm italic text-muted-foreground">Agreed rules: “{data.config.rules}”</p>}

      <div className="mb-4 flex items-center gap-2 text-sm">
        {conn === "connected" ? <Wifi className="size-4 text-success" aria-hidden /> : <WifiOff className="size-4 text-destructive" aria-hidden />}
        <span>
          {closed ? "Lobby closed" : conn === "connected" ? "Connected to lobby" : conn === "connecting" ? "Connecting…" : "Connection problem — retrying"}
        </span>
      </div>

      <div className="relative grid gap-4 sm:grid-cols-2">
        {players.map(({ player, left }) => {
          const connected = peers.has(player.id);
          const isReady = peers.get(player.id) === true;
          const isMe = player.id === me;
          return (
            <GlassPanel key={player.id} className={cn("flex flex-col items-center text-center transition-shadow", isReady && "shadow-glow ring-2 ring-success/70")}>
              <div className="h-56 w-40">{player.avatar_config ? <AvatarPreview config={player.avatar_config} /> : null}</div>
              <p className="mt-2 font-display text-2xl font-black uppercase">{player.display_name}{isMe && <span className="text-accent"> (you)</span>}</p>
              <p className="text-sm text-muted-foreground">@{player.username} · Level {player.level}</p>
              <p className={cn("mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider",
                left ? "bg-destructive/20 text-destructive" : isReady ? "bg-success/20 text-success" : connected ? "bg-secondary" : "bg-secondary text-muted-foreground")}>
                {left ? "Left" : isReady ? <><CheckCircle2 className="size-3.5" aria-hidden /> Ready</> : connected ? "Connected · not ready" : "Not connected"}
              </p>
            </GlassPanel>
          );
        })}
        <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-hot px-4 py-2 font-display text-2xl font-black italic text-accent-foreground shadow-hot sm:block">VS</span>
      </div>

      <div className="mt-6 text-center">
        {closed ? (
          <GlassPanel>
            <p className="font-display text-2xl font-bold uppercase">This lobby is closed</p>
            <p className="text-sm text-muted-foreground">
              {data.status === "abandoned" ? "A player left before the match started. No result or rating change was recorded." : `Match status: ${data.status}.`}
            </p>
          </GlassPanel>
        ) : countdown !== null && countdown > 0 ? (
          <div role="timer" aria-live="assertive" className="font-display text-8xl font-black text-gradient-gold">{countdown}</div>
        ) : countdown === 0 ? (
          <GlassPanel>
            <p className="font-display text-2xl font-bold uppercase">Both players ready!</p>
            <p className="mx-auto max-w-lg text-sm text-muted-foreground">
              Live {sport?.name ?? ""} gameplay runs on the PLAYVERSE game server, which arrives in the next update. Your lobby and settings are saved — nothing has been scored.
            </p>
          </GlassPanel>
        ) : (
          <>
            <GameButton size="xl" variant={ready ? "glass" : "hot"} disabled={conn !== "connected"} onClick={() => setReady(!ready)} aria-pressed={ready}>
              {ready ? "Not ready" : "I'm ready"}
            </GameButton>
            <p className="mt-2 text-sm text-muted-foreground">
              {!allConnected ? "Waiting for both players to connect…" : "The countdown starts when both players are ready."}
            </p>
          </>
        )}
      </div>
    </PageShell>
  );
}
