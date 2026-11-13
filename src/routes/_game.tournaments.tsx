import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus, Trophy } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";
import { useCreateTournament, useMyTournaments } from "@/lib/competitive";
import { MATCH_FORMATS } from "@/lib/match-config";
import { SPORTS, getSport, type SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/tournaments")({
  head: () => ({ meta: [
    { title: "Tournaments — PLAYVERSE" }, { name: "description", content: "Knockout tournaments with your friends in any sport." },
    { property: "og:title", content: "Tournaments — PLAYVERSE" }, { property: "og:description", content: "Knockout tournaments with your friends in any sport." },
  ] }),
  component: Page,
});

const STATUS: Record<string, string> = { registration: "Open for players", in_progress: "In progress", completed: "Finished", cancelled: "Cancelled", scheduled: "Scheduled" };

function Page() {
  return (
    <PageShell title="Tournaments" description="Knockout brackets with your friends. Every match is played online and verified by the server.">
      <RequireAccount feature="Tournaments">
        <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
          <MyTournaments />
          <CreateTournament />
        </div>
      </RequireAccount>
    </PageShell>
  );
}

function MyTournaments() {
  const q = useMyTournaments();
  if (q.isLoading) return <div className="flex justify-center py-16" role="status"><Loader2 className="size-8 animate-spin text-primary" aria-label="Loading tournaments" /></div>;
  if (q.isError) return <p role="alert" className="text-destructive">Couldn't load tournaments.</p>;
  const list = q.data ?? [];
  if (list.length === 0) return <EmptyState icon={<Trophy />} title="No tournaments yet" description="Create one and invite your friends, or join one a friend has opened." />;
  return (
    <ul className="grid gap-3">
      {list.map((t) => {
        const sport = getSport(t.sport);
        return (
          <li key={t.id}>
            <Link to="/tournament/$tournamentId" params={{ tournamentId: t.id }} className="glass flex items-center gap-4 rounded-2xl p-4 transition hover:bg-white/10">
              {sport && <img src={sport.image} alt="" className="size-14 rounded-xl object-cover" />}
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-xl font-bold uppercase">{t.name}</p>
                <p className="text-sm text-muted-foreground">{sport?.name} · hosted by {t.mine ? "you" : t.host} · {t.players}/{t.size} players</p>
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-bold", t.status === "registration" ? "bg-primary/20 text-primary" : t.status === "in_progress" ? "bg-[#ff7a1a]/20 text-[#ff7a1a]" : "bg-secondary")}>
                {t.status === "registration" && !t.joined ? "Join" : STATUS[t.status]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function CreateTournament() {
  const navigate = useNavigate();
  const create = useCreateTournament();
  const [name, setName] = useState("");
  const [sport, setSport] = useState<SportId>("bowling");
  const f = MATCH_FORMATS[sport];
  const [mode, setMode] = useState<string>(f.defaultMode);
  const [length, setLength] = useState<number>(f.defaultLength);
  const [size, setSize] = useState<4 | 8>(4);
  const pickSport = (s: SportId) => {
    setSport(s);
    setMode(MATCH_FORMATS[s].defaultMode);
    setLength(MATCH_FORMATS[s].defaultLength);
  };
  return (
    <form className="glass h-fit rounded-3xl p-5" onSubmit={(e) => {
      e.preventDefault();
      create.mutate({ name, sport, size, config: { mode, length, public: false } as never }, { onSuccess: (id) => navigate({ to: "/tournament/$tournamentId", params: { tournamentId: id } }) });
    }}>
      <h2 className="flex items-center gap-2 font-display text-2xl font-bold uppercase"><Plus className="size-5" aria-hidden /> New tournament</h2>
      <label className="mt-3 block text-xs font-bold uppercase tracking-wider text-white/70" htmlFor="tname">Name</label>
      <input id="tname" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Friday Night Cup" className="mt-1 h-11 w-full rounded-xl bg-secondary px-3 outline-none focus:ring-2 focus:ring-primary" />
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/70">Sport</p>
      <div className="mt-1 grid grid-cols-2 gap-2">
        {SPORTS.map((s) => <button type="button" key={s.id} aria-pressed={sport === s.id} onClick={() => pickSport(s.id)} className={cn("rounded-xl px-3 py-2 text-sm font-semibold", sport === s.id ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>{s.name}</button>)}
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/70">Format</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {f.modes.map((m) => <button type="button" key={m.id} aria-pressed={mode === m.id} onClick={() => setMode(m.id)} className={cn("rounded-xl px-3 py-2 text-sm font-semibold", mode === m.id ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>{m.label}</button>)}
        {f.lengths.map((n) => <button type="button" key={n} aria-pressed={length === n} onClick={() => setLength(n)} className={cn("rounded-xl px-3 py-2 text-sm font-semibold", length === n ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>{f.unit(n)}</button>)}
      </div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-white/70">Players</p>
      <div className="mt-1 flex gap-2">
        {([4, 8] as const).map((n) => <button type="button" key={n} aria-pressed={size === n} onClick={() => setSize(n)} className={cn("h-11 flex-1 rounded-xl font-display text-lg font-bold", size === n ? "bg-gradient-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}>{n}</button>)}
      </div>
      {create.isError && <p role="alert" className="mt-3 text-sm text-destructive">{create.error.message}</p>}
      <GameButton type="submit" variant="hot" className="mt-4 w-full" disabled={create.isPending || name.trim().length < 3}>{create.isPending ? "Creating…" : "Create & invite friends"}</GameButton>
      <p className="mt-2 text-xs text-muted-foreground">Your friends see it on their Tournaments page and can join until it's full. You start it when every spot is taken.</p>
    </form>
  );
}
