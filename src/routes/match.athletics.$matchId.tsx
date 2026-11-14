import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MatchReactions } from "@/components/game/MatchReactions";
import { MatchIntro } from "@/components/game/MatchIntro";
import { Loader2, RotateCcw, Trophy } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AthleticsStage } from "@/components/athletics/AthleticsStage";
import { ControlsCard } from "@/components/game/ControlsGuide";
import { GameButton } from "@/components/game/GameButton";
import { RequireAccount } from "@/components/game/RequireAccount";
import { HUMANS, FIELD_SIZE, type AthleticsMeta } from "@/game/athletics/net";
import { ROSTER } from "@/game/athletics/roster";
import { EVENTS, PLACE_POINTS, placings, type EventId, type EventState } from "@/game/athletics/sim";
import { OnlineAthleticsDriver, type AthleticsEnd } from "@/lib/athletics-online";
import type { AvatarConfig } from "@/lib/avatar";
import { setActivity } from "@/lib/presence";
import { useCreateInvitation } from "@/lib/social";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/match/athletics/$matchId")({
  head: () => ({
    meta: [
      { title: "Athletics meeting — PLAYVERSE" },
      { name: "description", content: "Live 1v1 athletics." },
      { property: "og:title", content: "Athletics meeting — PLAYVERSE" },
      { property: "og:description", content: "Live 1v1 athletics." },
    ],
  }),
  component: Page,
});

function Page() {
  const { matchId } = Route.useParams();
  return (
    <div className="fixed inset-0 bg-black">
      <RequireAccount feature="Online athletics">
        <OnlineAthletics matchId={matchId} />
      </RequireAccount>
      <MatchReactions matchId={matchId} />
      <MatchIntro matchId={matchId} />
    </div>
  );
}

function OnlineAthletics({ matchId }: { matchId: string }) {
  const [driver, setDriver] = useState<OnlineAthleticsDriver | null>(null);
  const [meta, setMeta] = useState<(AthleticsMeta & { avatars: (AvatarConfig | null)[] }) | null>(null);
  const [idx, setIdx] = useState(0);
  const [ready, setReady] = useState(false);
  const [end, setEnd] = useState<AthleticsEnd | null>(null);
  const [between, setBetween] = useState<{ event: EventId; order: number[]; marks: (number | null)[] } | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [status, setStatus] = useState("Connecting to the game server…");

  useEffect(() => {
    setActivity("in_match");
    const d = new OnlineAthleticsDriver(matchId);
    d.onMeta = setMeta;
    d.onEventChange = (i) => {
      setIdx(i);
      setReady(true);
      setBetween(null);
    };
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

  const names = useMemo(() => (meta ? [...meta.names, ...ROSTER.slice(0, FIELD_SIZE - HUMANS).map((r) => r.name)] : []), [meta]);
  const avatars = useMemo(() => (meta ? [...meta.avatars, ...ROSTER.slice(0, FIELD_SIZE - HUMANS).map((r) => r.avatar)] : []), [meta]);

  if (fatal) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-white">
        <div className="glass max-w-md rounded-3xl p-6">
          <p className="font-display text-2xl font-bold uppercase">Can't join this meeting</p>
          <p className="mt-2 text-sm text-white/75">{fatal}</p>
          <GameButton asChild variant="hot" className="mt-4"><Link to="/hub">Back to hub</Link></GameButton>
        </div>
      </div>
    );
  }
  const event = (meta?.events[idx] ?? "sprint100") as EventId;
  if (!driver || !meta || !ready || !driver.state()) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 overflow-y-auto p-4 text-center text-white sm:p-6">
        <div role="status" className="flex flex-col items-center gap-2">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <p className="max-w-sm text-sm text-white/80">{status}</p>
        </div>
        <ControlsCard className="w-full max-w-lg" sport="athletics" events={meta?.events} />
      </div>
    );
  }
  const me = meta.you, opp = me === 0 ? 1 : 0;
  const overlay = end ? <EndCard meta={meta} end={end} /> : between ? (
    <div className="absolute inset-0 flex items-center justify-center bg-black/50 p-4">
      <div className="glass w-full max-w-md rounded-3xl p-6 text-white animate-rise">
        <p className="text-xs font-bold uppercase tracking-wider text-white/60">{EVENTS[between.event].name} · result</p>
        <ol className="mt-2 space-y-1">
          {between.order.map((i, k) => (
            <li key={i} className={cn("flex justify-between rounded-lg px-3 py-1.5", i < HUMANS ? "bg-white/15 font-bold" : "bg-white/5")}>
              <span>{k + 1}. {names[i]}</span>
              <span className="tabular-nums">{between.marks[i] === null ? "—" : `${between.marks[i]!.toFixed(2)}${EVENTS[between.event].kind === "race" ? " s" : " m"}`} · +{PLACE_POINTS[k] ?? 0}</span>
            </li>
          ))}
        </ol>
        {meta.events.length > 1 && (
          <p className="mt-4 font-display text-xl font-bold uppercase">
            You {driver.points[me]} – {driver.points[opp]} {meta.names[opp]}
          </p>
        )}
        <p className="mt-2 text-sm text-white/70">{idx + 1 < meta.events.length ? `Next: ${EVENTS[meta.events[idx + 1] as EventId].name} — starting shortly…` : "Final results coming up…"}</p>
      </div>
    </div>
  ) : null;
  return (
    <AthleticsStage
      key={`${me}-${idx}`}
      event={event}
      driver={driver}
      names={names}
      avatars={avatars}
      overlay={overlay}
      onEventEnd={(s: EventState) => setBetween({ event: s.event, order: placings(s), marks: s.athletes.map((a) => a.finish) })}
      topRight={<Link to="/hub" className="glass rounded-full px-3 py-2 text-xs font-bold text-white">Hub</Link>}
    />
  );
}

function EndCard({ meta, end }: { meta: AthleticsMeta & { avatars: (AvatarConfig | null)[] }; end: AthleticsEnd }) {
  const navigate = useNavigate();
  const rematch = useCreateInvitation();
  const me = meta.you, opp = me === 0 ? 1 : 0;
  const won = end.winner === me;
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/55 p-4">
      <div className="glass w-full max-w-md rounded-3xl p-6 text-center text-white animate-rise">
        <Trophy className={cn("mx-auto size-10", won ? "text-[#ffd23f]" : "text-white/50")} aria-hidden />
        <h2 className="mt-2 font-display text-4xl font-black uppercase">{won ? "Gold!" : `${meta.names[end.winner]} wins`}</h2>
        {end.forfeit && <p className="text-sm text-white/70">{won ? "Your opponent left the meeting." : "You were disconnected for too long."}</p>}
        {meta.events.length > 1 && <p className="mt-1 font-display text-2xl">{Math.max(0, end.points[me] ?? 0)} – {Math.max(0, end.points[opp] ?? 0)} pts</p>}
        <p className="mt-3 text-xs text-white/60">{end.saved ? "Result verified by the game server and saved to your profile." : "Saving the result…"}</p>
        {rematch.isError && <p role="alert" className="mt-2 text-sm text-destructive">{rematch.error.message}</p>}
        <div className="mt-5 flex justify-center gap-2">
          <GameButton variant="hot" disabled={rematch.isPending}
            onClick={() => rematch.mutate({ target: meta.ids[opp]!, sport: "athletics", config: { mode: meta.events.length > 1 ? "championship" : meta.events[0]!, length: 1, public: false } }, { onSuccess: () => navigate({ to: "/invitations" }) })}>
            <RotateCcw aria-hidden /> {rematch.isPending ? "Sending…" : "Rematch"}
          </GameButton>
          <GameButton asChild variant="glass"><Link to="/hub">Hub</Link></GameButton>
        </div>
      </div>
    </div>
  );
}
