import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { GameButton } from "@/components/game/GameButton";
import { RequireAccount } from "@/components/game/RequireAccount";
import { TennisStage } from "@/components/tennis/TennisStage";
import { COURT_THEMES, type CourtTheme } from "@/game/tennis/themes";
import { setActivity } from "@/lib/presence";
import { useCreateInvitation } from "@/lib/social";
import { OnlineTennisDriver, type OnlineEnd, type OnlineMeta } from "@/lib/tennis-online";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match/tennis/$matchId")({
  head: () => ({
    meta: [
      { title: "Tennis match — PLAYVERSE" },
      { name: "description", content: "Live 1v1 tennis match." },
      { property: "og:title", content: "Tennis match — PLAYVERSE" },
      { property: "og:description", content: "Live 1v1 tennis match." },
    ],
  }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  return (
    <div className="fixed inset-0 bg-black">
      <RequireAccount feature="Online matches">
        <OnlineTennis matchId={matchId} />
      </RequireAccount>
    </div>
  );
}

function OnlineTennis({ matchId }: { matchId: string }) {
  const [driver, setDriver] = useState<OnlineTennisDriver | null>(null);
  const [meta, setMeta] = useState<OnlineMeta | null>(null);
  const [end, setEnd] = useState<OnlineEnd | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to the game server…");

  useEffect(() => {
    setActivity("in_match");
    const d = new OnlineTennisDriver(matchId);
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

  const theme: CourtTheme = useMemo(() => COURT_THEMES[(meta?.theme ?? "hard") as CourtTheme["id"]] ?? COURT_THEMES.hard, [meta?.theme]);

  if (fatal) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-white">
        <div className="glass max-w-md rounded-3xl p-6">
          <p className="font-display text-2xl font-bold uppercase">Can't join this match</p>
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
    <TennisStage
      key={`${meta.you}-${meta.theme}`}
      theme={theme}
      driver={driver}
      names={meta.names}
      avatars={meta.avatars}
      topRight={<Link to="/hub" className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Hub</Link>}
      renderEnd={({ winner, score, stats }) => <EndCard meta={meta} end={end} winner={winner} history={score.history} stats={stats} />}
    />
  );
}

function EndCard({ meta, end, winner, history, stats }: { meta: OnlineMeta; end: OnlineEnd | null; winner: 0 | 1; history: [number, number][]; stats: OnlineEnd["stats"] }) {
  const navigate = useNavigate();
  const rematch = useCreateInvitation();
  const me = meta.you, opp = me === 0 ? 1 : 0;
  const won = winner === me;
  return (
    <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white animate-rise">
      <Trophy className={cn("mx-auto size-10", won ? "text-[#ffd23f]" : "text-white/50")} aria-hidden />
      <h2 className="mt-2 font-display text-4xl font-black uppercase">{won ? "Victory!" : `${meta.names[winner]} wins`}</h2>
      {end?.forfeit && <p className="text-sm text-white/70">{won ? "Your opponent left the match." : "You were disconnected for too long."}</p>}
      <p className="mt-1 font-display text-2xl">{history.map((h) => `${h[me]}–${h[opp]}`).join("  ")}</p>
      <table className="mx-auto mt-4 w-full text-sm">
        <thead><tr className="text-white/60"><th className="text-left font-normal">Stat</th><th>{meta.names[me]}</th><th>{meta.names[opp]}</th></tr></thead>
        <tbody>
          {(["pointsWon", "aces", "winners", "errors", "doubleFaults"] as const).map((k) => (
            <tr key={k} className="border-t border-white/10">
              <td className="py-1 text-left text-white/70">{{ pointsWon: "Points won", aces: "Aces", winners: "Winners", errors: "Errors", doubleFaults: "Double faults" }[k]}</td>
              <td className="font-bold">{stats[me][k]}</td>
              <td className="font-bold">{stats[opp][k]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-white/60">{end?.saved ? "Result verified by the game server and saved to your profile." : "Saving the result…"}</p>
      {rematch.isError && <p role="alert" className="mt-2 text-sm text-destructive">{rematch.error.message}</p>}
      <div className="mt-5 flex justify-center gap-2">
        <GameButton variant="hot" disabled={rematch.isPending}
          onClick={() => rematch.mutate({ target: meta.ids[opp], sport: "tennis", config: { mode: meta.format.gamesPerSet === 6 ? "standard" : "quick", length: meta.format.bestOf, public: false } }, { onSuccess: () => navigate({ to: "/invitations" }) })}>
          <RotateCcw aria-hidden /> {rematch.isPending ? "Sending…" : "Rematch"}
        </GameButton>
        <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
      </div>
    </div>
  );
}
