import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ControlsCard } from "@/components/game/ControlsGuide";
import { GameButton } from "@/components/game/GameButton";
import { RequireAccount } from "@/components/game/RequireAccount";
import { ParkourResults, RUNNER_COLORS } from "@/components/parkour/ParkourResults";
import { ParkourStage } from "@/components/parkour/ParkourStage";
import { FIELD_SIZE, HUMANS, type ParkourMeta } from "@/game/parkour/net";
import { CREW } from "@/game/parkour/roster";
import { LENGTHS } from "@/game/parkour/sim";
import type { AvatarConfig } from "@/lib/avatar";
import { OnlineParkourDriver, type ParkourEnd } from "@/lib/parkour-online";
import { setActivity } from "@/lib/presence";
import { useCreateInvitation } from "@/lib/social";

export const Route = createFileRoute("/match/parkour/$matchId")({
  head: () => ({
    meta: [
      { title: "Rooftop Rush — PLAYVERSE" },
      { name: "description", content: "Live 1v1 parkour race." },
      { property: "og:title", content: "Rooftop Rush — PLAYVERSE" },
      { property: "og:description", content: "Live 1v1 parkour race." },
    ],
  }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  return (
    <div className="fixed inset-0 bg-black">
      <RequireAccount feature="Online parkour">
        <OnlineParkour matchId={matchId} />
      </RequireAccount>
    </div>
  );
}

type Meta = ParkourMeta & { avatars: (AvatarConfig | null)[] };

function OnlineParkour({ matchId }: { matchId: string }) {
  const [driver, setDriver] = useState<OnlineParkourDriver | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [ready, setReady] = useState(false);
  const [end, setEnd] = useState<ParkourEnd | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to the game server…");

  useEffect(() => {
    setActivity("in_match");
    const d = new OnlineParkourDriver(matchId);
    d.onMeta = setMeta;
    d.onReady = () => setReady(true);
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

  const names = useMemo(() => (meta ? [...meta.names, ...CREW.slice(0, FIELD_SIZE - HUMANS).map((c) => c.name)] : []), [meta]);
  const avatars = useMemo(() => (meta ? [...meta.avatars, ...CREW.slice(0, FIELD_SIZE - HUMANS).map((c) => c.avatar)] : []), [meta]);
  const colors = useMemo(() => RUNNER_COLORS.slice(0, FIELD_SIZE), []);

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
  if (!driver || !meta || !ready || !driver.state()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center text-white sm:p-6">
        <div role="status" className="flex flex-col items-center gap-2">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="max-w-sm text-sm text-white/80">{status}</p>
        </div>
        <ControlsCard className="w-full max-w-lg" sport="parkour" />
      </div>
    );
  }
  return (
    <ParkourStage
      driver={driver}
      names={names}
      avatars={avatars}
      colors={colors}
      topRight={<Link to="/hub" className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Hub</Link>}
      renderEnd={(s) => <ParkourResults s={s} names={names} colors={colors} viewer={meta.you} note={<EndNote meta={meta} end={end} />} actions={<EndActions meta={meta} />} />}
    />
  );
}

function EndNote({ meta, end }: { meta: Meta; end: ParkourEnd | null }) {
  if (!end) return <p className="mt-3 text-xs text-white/60">Waiting for the official result…</p>;
  const won = end.winner === meta.you;
  const opp = meta.names[meta.you === 0 ? 1 : 0];
  return (
    <div className="mt-3">
      <p className="font-display text-xl font-bold uppercase">{won ? `You beat ${opp}!` : `${opp} wins the 1v1`}</p>
      {end.forfeit && <p className="text-sm text-white/70">{won ? "Your opponent left the race." : "You were disconnected for too long."}</p>}
      <p className="mt-1 text-xs text-white/60">{end.saved ? "Result verified by the game server and saved to your profile." : "Saving the result…"}</p>
    </div>
  );
}

function EndActions({ meta }: { meta: Meta }) {
  const navigate = useNavigate();
  const rematch = useCreateInvitation();
  const opp = meta.you === 0 ? 1 : 0;
  const mode = (Object.keys(LENGTHS) as (keyof typeof LENGTHS)[]).find((k) => LENGTHS[k] === meta.length) ?? "standard";
  return (
    <>
      {rematch.isError && <p role="alert" className="w-full text-sm text-destructive">{rematch.error.message}</p>}
      <GameButton variant="hot" disabled={rematch.isPending}
        onClick={() => rematch.mutate({ target: meta.ids[opp]!, sport: "parkour", config: { mode, length: 1, public: false } }, { onSuccess: () => navigate({ to: "/invitations" }) })}>
        <RotateCcw aria-hidden /> {rematch.isPending ? "Sending…" : "Rematch"}
      </GameButton>
      <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
    </>
  );
}
