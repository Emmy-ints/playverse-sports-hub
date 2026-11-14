import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, Loader2, Trophy } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { GameButton } from "@/components/game/GameButton";
import { MatchReactions } from "@/components/game/MatchReactions";
import { RequireAccount } from "@/components/game/RequireAccount";
import { ParkourResults, RUNNER_COLORS } from "@/components/parkour/ParkourResults";
import { ParkourStage } from "@/components/parkour/ParkourStage";
import { formatTime, RaceStage } from "@/components/racing/RaceStage";
import { FIELD_SIZE, HUMANS, type ParkourMeta } from "@/game/parkour/net";
import { CREW } from "@/game/parkour/roster";
import { CAR_COLORS } from "@/game/racing/themes";
import type { AvatarConfig } from "@/lib/avatar";
import { OnlineParkourDriver, type ParkourEnd } from "@/lib/parkour-online";
import { OnlineRaceDriver, type RaceEnd, type RaceMeta } from "@/lib/racing-online";
import { useFriendsLive, WATCHABLE } from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/watch/$matchId")({
  head: () => ({
    meta: [
      { title: "Watch live — PLAYVERSE" },
      { name: "description", content: "Watch a friend's live match." },
      { property: "og:title", content: "Watch live — PLAYVERSE" },
      { property: "og:description", content: "Watch a friend's live match." },
    ],
  }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  return (
    <div className="fixed inset-0 bg-black">
      <RequireAccount feature="Spectating">
        <Watch matchId={matchId} />
      </RequireAccount>
      <MatchReactions matchId={matchId} />
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-white">
      <div className="glass max-w-md rounded-3xl p-6">{children}</div>
    </div>
  );
}

function Watch({ matchId }: { matchId: string }) {
  const live = useFriendsLive();
  const [sport, setSport] = useState<string | null>(null);
  useEffect(() => {
    const m = live.data?.find((x) => x.id === matchId);
    if (m && !sport) setSport(m.sport);
  }, [live.data, matchId, sport]);

  if (sport === "racing") return <WatchRace matchId={matchId} />;
  if (sport === "parkour") return <WatchParkour matchId={matchId} />;
  if (live.isLoading) return <Shell><Loader2 className="mx-auto size-8 animate-spin" aria-label="Loading" /></Shell>;
  const m = live.data?.find((x) => x.id === matchId);
  return (
    <Shell>
      <p className="font-display text-2xl font-bold uppercase">{m ? "Can't watch this one yet" : "Not live any more"}</p>
      <p className="mt-2 text-sm text-white/75">
        {m && !WATCHABLE.includes(m.sport) ? "Live spectating is available for racing and parkour." : "You can watch your friends' online races while they're running."}
      </p>
      <GameButton asChild variant="hot" className="mt-4"><Link to="/friends">Back to friends</Link></GameButton>
    </Shell>
  );
}

const badge = (
  <div className="flex items-center gap-2">
    <span className="flex items-center gap-1 rounded-full bg-[#ff3b5c] px-3 py-1.5 text-xs font-black uppercase text-white"><Eye className="size-3.5" aria-hidden /> Watching</span>
    <Link to="/friends" className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Leave</Link>
  </div>
);

function useDriver<D extends { destroy(): void; status(): string | null; onFatal: (m: string) => void }>(make: () => D, deps: unknown[]) {
  const [driver, setDriver] = useState<D | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to the game server…");
  useEffect(() => {
    const d = make();
    d.onFatal = setFatal;
    setDriver(d);
    const t = setInterval(() => setStatus(d.status() ?? "Joining…"), 500);
    return () => {
      clearInterval(t);
      d.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { driver, fatal, status };
}

function Waiting({ status }: { status: string }) {
  return (
    <div role="status" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-white">
      <Loader2 className="size-8 animate-spin" aria-hidden />
      <p className="max-w-sm text-sm text-white/80">{status}</p>
    </div>
  );
}

function Fatal({ msg }: { msg: string }) {
  return (
    <Shell>
      <p className="font-display text-2xl font-bold uppercase">Can't watch</p>
      <p className="mt-2 text-sm text-white/75">{msg}</p>
      <GameButton asChild variant="hot" className="mt-4"><Link to="/friends">Back to friends</Link></GameButton>
    </Shell>
  );
}

function WatchRace({ matchId }: { matchId: string }) {
  const [meta, setMeta] = useState<RaceMeta | null>(null);
  const [end, setEnd] = useState<RaceEnd | null>(null);
  const { driver, fatal, status } = useDriver(() => {
    const d = new OnlineRaceDriver(matchId, { spectate: true });
    d.onMeta = setMeta;
    d.onEnd = setEnd;
    return d;
  }, [matchId]);
  const colors = useMemo(() => (meta ? meta.names.map((_, i) => CAR_COLORS[i]!) : []), [meta]);
  const helmets = useMemo(() => (meta ? meta.avatars.map((a) => a?.outfitColor ?? "#ffffff") : []), [meta]);
  if (fatal) return <Fatal msg={fatal} />;
  if (!driver || !meta) return <Waiting status={status} />;
  return (
    <RaceStage
      key={meta.track}
      track={meta.track}
      driver={driver}
      names={meta.names}
      colors={colors}
      helmets={helmets}
      topRight={badge}
      renderEnd={({ rows, final }) => (
        <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white animate-rise">
          <Trophy className="mx-auto size-10 text-[#ffd23f]" aria-hidden />
          <h2 className="mt-2 font-display text-3xl font-black uppercase">{final || end ? `${rows[0]?.name ?? ""} wins` : "Race finishing…"}</h2>
          <ol className="mt-4 space-y-1 text-left text-sm">
            {rows.map((r, i) => (
              <li key={r.car} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5">
                <span className="w-6 font-display">{i + 1}</span>
                <span className="size-3 rounded-full" style={{ background: r.color }} />
                <span className="flex-1 truncate">{r.name}</span>
                <span className="tabular-nums">{r.time !== null ? formatTime(r.time) : "racing"}</span>
              </li>
            ))}
          </ol>
          {end?.saved && <p className="mt-3 text-xs text-white/60">Official result, verified by the game server.</p>}
          <GameButton asChild variant="glass" className="mt-4"><Link to="/friends">Back to friends</Link></GameButton>
        </div>
      )}
    />
  );
}

type PMeta = ParkourMeta & { avatars: (AvatarConfig | null)[] };

function WatchParkour({ matchId }: { matchId: string }) {
  const [meta, setMeta] = useState<PMeta | null>(null);
  const [ready, setReady] = useState(false);
  const [end, setEnd] = useState<ParkourEnd | null>(null);
  const { driver, fatal, status } = useDriver(() => {
    const d = new OnlineParkourDriver(matchId, { spectate: true });
    d.onMeta = setMeta;
    d.onReady = () => setReady(true);
    d.onEnd = setEnd;
    return d;
  }, [matchId]);
  const names = useMemo(() => (meta ? [...meta.names, ...CREW.slice(0, FIELD_SIZE - HUMANS).map((c) => c.name)] : []), [meta]);
  const avatars = useMemo(() => (meta ? [...meta.avatars, ...CREW.slice(0, FIELD_SIZE - HUMANS).map((c) => c.avatar)] : []), [meta]);
  const colors = useMemo(() => RUNNER_COLORS.slice(0, FIELD_SIZE), []);
  if (fatal) return <Fatal msg={fatal} />;
  if (!driver || !meta || !ready || !driver.state()) return <Waiting status={status} />;
  return (
    <ParkourStage
      driver={driver}
      names={names}
      avatars={avatars}
      colors={colors}
      topRight={badge}
      renderEnd={(s) => (
        <ParkourResults s={s} names={names} colors={colors} viewer={-1}
          note={<p className={cn("mt-3 text-sm", end ? "font-bold" : "text-white/60")}>{end ? `${meta.names[end.winner] ?? ""} wins the 1v1` : "Waiting for the official result…"}</p>}
          actions={<GameButton asChild variant="glass"><Link to="/friends">Back to friends</Link></GameButton>} />
      )}
    />
  );
}
