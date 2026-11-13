import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GameButton } from "@/components/game/GameButton";
import { RequireAccount } from "@/components/game/RequireAccount";
import { formatTime, RaceStage } from "@/components/racing/RaceStage";
import { CAR_COLORS } from "@/game/racing/themes";
import { setActivity } from "@/lib/presence";
import { OnlineRaceDriver, type RaceEnd, type RaceMeta } from "@/lib/racing-online";
import { useCreateInvitation } from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match/racing/$matchId")({
  head: () => ({
    meta: [
      { title: "Race — PLAYVERSE" },
      { name: "description", content: "Live 1v1 race." },
      { property: "og:title", content: "Race — PLAYVERSE" },
      { property: "og:description", content: "Live 1v1 race." },
    ],
  }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  return (
    <div className="fixed inset-0 bg-black">
      <RequireAccount feature="Online races">
        <OnlineRace matchId={matchId} />
      </RequireAccount>
    </div>
  );
}

function OnlineRace({ matchId }: { matchId: string }) {
  const [driver, setDriver] = useState<OnlineRaceDriver | null>(null);
  const [meta, setMeta] = useState<RaceMeta | null>(null);
  const [end, setEnd] = useState<RaceEnd | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to the game server…");

  useEffect(() => {
    setActivity("in_match");
    const d = new OnlineRaceDriver(matchId);
    d.onMeta = setMeta;
    d.onEnd = setEnd;
    d.onFatal = setFatal;
    setDriver(d);
    const t = setInterval(() => setStatus(d.status() ?? "Joining…"), 500);
    return () => {
      clearInterval(t);
      d.destroy();
      setActivity(null);
    };
  }, [matchId]);

  const colors = useMemo(() => (meta ? meta.names.map((_, i) => CAR_COLORS[i === meta.you ? 0 : 1]!) : []), [meta]);
  const helmets = useMemo(() => (meta ? meta.avatars.map((a) => a?.outfitColor ?? "#ffffff") : []), [meta]);

  if (fatal) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-white">
        <div className="glass max-w-md rounded-3xl p-6">
          <p className="font-display text-2xl font-bold uppercase">Can't join this race</p>
          <p className="mt-2 text-sm text-white/75">{fatal}</p>
          <GameButton asChild variant="hot" className="mt-4"><Link to="/hub">Back to hub</Link></GameButton>
        </div>
      </div>
    );
  }
  if (!driver || !meta) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-white" role="status">
        <Loader2 className="size-8 animate-spin" aria-hidden />
        <p className="max-w-sm text-sm text-white/80">{status}</p>
      </div>
    );
  }
  return (
    <RaceStage
      key={`${meta.you}-${meta.track}`}
      track={meta.track}
      driver={driver}
      names={meta.names}
      colors={colors}
      helmets={helmets}
      topRight={<Link to="/hub" className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Hub</Link>}
      renderEnd={({ rows, final, viewer }) => <EndCard meta={meta} end={end} rows={rows} final={final} viewer={viewer} />}
    />
  );
}

function EndCard({ meta, end, rows, final, viewer }: { meta: RaceMeta; end: RaceEnd | null; rows: { car: number; name: string; time: number | null; best: number; color: string }[]; final: boolean; viewer: number }) {
  const navigate = useNavigate();
  const rematch = useCreateInvitation();
  const mine = rows.findIndex((r) => r.car === viewer) + 1;
  const opp = viewer === 0 ? 1 : 0;
  const done = final || !!end;
  return (
    <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white animate-rise">
      <Trophy className={cn("mx-auto size-10", mine === 1 ? "text-[#ffd23f]" : "text-white/50")} aria-hidden />
      <h2 className="mt-2 font-display text-4xl font-black uppercase">{!done ? "Finished!" : mine === 1 ? "Victory!" : `${meta.names[opp]} wins`}</h2>
      {!done && <p className="text-sm text-white/70">Waiting for {meta.names[opp]} to finish…</p>}
      {end?.forfeit && <p className="text-sm text-white/70">{mine === 1 ? "Your opponent left the race." : "You were disconnected for too long."}</p>}
      <ol className="mt-4 space-y-1 text-left text-sm">
        {rows.map((r, i) => (
          <li key={r.car} className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5", r.car === viewer ? "bg-white/15 font-bold" : "bg-white/5")}>
            <span className="w-6 font-display">{i + 1}</span>
            <span className="size-3 rounded-full" style={{ background: r.color }} />
            <span className="flex-1 truncate">{r.name}</span>
            <span className="tabular-nums">{r.time !== null ? formatTime(r.time) : done ? "DNF" : "racing"}</span>
            <span className="w-20 text-right text-xs tabular-nums text-white/60">{r.best ? formatTime(r.best) : ""}</span>
          </li>
        ))}
      </ol>
      {done && <p className="mt-3 text-xs text-white/60">{end?.saved ? "Result verified by the game server and saved to your profile." : "Saving the result…"}</p>}
      {rematch.isError && <p role="alert" className="mt-2 text-sm text-destructive">{rematch.error.message}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <GameButton variant="hot" disabled={rematch.isPending || !done}
          onClick={() => rematch.mutate({ target: meta.ids[opp]!, sport: "racing", config: { mode: "race", length: meta.laps, public: false } }, { onSuccess: () => navigate({ to: "/invitations" }) })}>
          <RotateCcw aria-hidden /> {rematch.isPending ? "Sending…" : "Rematch"}
        </GameButton>
        <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
      </div>
    </div>
  );
}
