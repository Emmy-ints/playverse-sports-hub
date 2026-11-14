import { createFileRoute, Link } from "@tanstack/react-router";
import { Crown, Loader2, LogOut, Plus, Search, Shield, UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/game/EmptyState";
import { GameButton } from "@/components/game/GameButton";
import { PageShell } from "@/components/game/PageShell";
import { RequireAccount } from "@/components/game/RequireAccount";
import { useClub, useClubs, useCreateClub, useJoinClub, useKickMember, useLeaveClub, type ClubDetail } from "@/lib/clubs";
import { flag } from "@/lib/competitive";
import { useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_game/clubs")({
  head: () => ({ meta: [
    { title: "Clubs — PLAYVERSE" }, { name: "description", content: "Join a club and climb the monthly club table together." },
    { property: "og:title", content: "Clubs — PLAYVERSE" }, { property: "og:description", content: "Join a club and climb the monthly club table together." },
  ] }),
  component: Page,
});

const COLORS = ["#ff7a1a", "#3ef0ff", "#ff3fb4", "#7cff6b", "#ffd23f", "#a78bfa"];

function Page() {
  return (
    <PageShell title="Clubs" description="Team up with up to 30 players. Club points are your members' All-Rounder points from verified online matches this month.">
      <RequireAccount feature="Clubs">
        <Clubs />
      </RequireAccount>
    </PageShell>
  );
}

function Clubs() {
  const mine = useClub(null);
  const [viewing, setViewing] = useState<string | null>(null);
  if (mine.isLoading) return <div className="flex justify-center py-16" role="status"><Loader2 className="size-8 animate-spin text-primary" aria-label="Loading clubs" /></div>;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        {mine.data && <ClubCard club={mine.data} />}
        {viewing && viewing !== mine.data?.id && <Viewed id={viewing} canJoin={!mine.data} onClose={() => setViewing(null)} />}
        <ClubTable onOpen={setViewing} myId={mine.data?.id ?? null} />
      </div>
      {!mine.data && <CreateClub />}
    </div>
  );
}

function Viewed({ id, canJoin, onClose }: { id: string; canJoin: boolean; onClose: () => void }) {
  const q = useClub(id);
  if (!q.data) return null;
  return <ClubCard club={q.data} canJoin={canJoin} onClose={onClose} />;
}

function ClubCard({ club, canJoin = false, onClose }: { club: ClubDetail; canJoin?: boolean; onClose?: () => void }) {
  const { session } = useSession();
  const me = session?.user.id;
  const join = useJoinClub();
  const leave = useLeaveClub();
  const kick = useKickMember();
  const owner = club.owner_id === me;
  const err = join.error ?? leave.error ?? kick.error;
  return (
    <section className="glass rounded-3xl p-5" style={{ boxShadow: `inset 0 0 0 2px ${club.color}55` }}>
      <div className="flex items-start gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-black text-black" style={{ background: club.color }}>{club.tag}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-3xl font-black uppercase leading-none">{club.name}</h2>
          {club.description && <p className="mt-1 text-sm text-muted-foreground">{club.description}</p>}
          <p className="mt-1 text-sm"><span className="font-bold">{club.points}</span> pts this month · {club.members.length}/30 members</p>
        </div>
        {onClose && <button type="button" onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Close</button>}
      </div>
      <ul className="mt-4 grid gap-1 sm:grid-cols-2">
        {club.members.map((m) => (
          <li key={m.id} className="flex items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2 text-sm">
            {m.role === "owner" ? <Crown className="size-4 text-gold" aria-label="Owner" /> : <Users className="size-4 text-muted-foreground" aria-hidden />}
            <Link to="/players/$username" params={{ username: m.username ?? "" }} className="min-w-0 flex-1 truncate font-semibold hover:underline">{flag(m.country)} {m.display_name}</Link>
            <span className="text-xs text-muted-foreground">Lv {m.level}</span>
            {owner && m.id !== me && (
              <button type="button" aria-label={`Remove ${m.display_name}`} disabled={kick.isPending} onClick={() => kick.mutate(m.id)} className="text-muted-foreground hover:text-destructive"><UserMinus className="size-4" /></button>
            )}
          </li>
        ))}
      </ul>
      {err && <p role="alert" className="mt-2 text-sm text-destructive">{err.message}</p>}
      <div className="mt-4 flex gap-2">
        {club.mine ? (
          <GameButton variant="glass" size="sm" disabled={leave.isPending} onClick={() => leave.mutate(undefined)}><LogOut aria-hidden /> {owner && club.members.length > 1 ? "Leave (ownership passes on)" : "Leave club"}</GameButton>
        ) : canJoin ? (
          <GameButton variant="hot" size="sm" disabled={join.isPending || club.members.length >= 30} onClick={() => join.mutate(club.id, { onSuccess: onClose })}><Plus aria-hidden /> Join {club.tag}</GameButton>
        ) : null}
      </div>
    </section>
  );
}

function ClubTable({ onOpen, myId }: { onOpen: (id: string) => void; myId: string | null }) {
  const [q, setQ] = useState("");
  const list = useClubs(q.trim());
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        <h2 className="flex-1 font-display text-2xl font-bold uppercase">Club table</h2>
        <label className="relative">
          <span className="sr-only">Search clubs</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or tag" className="h-10 w-48 rounded-xl bg-secondary pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary" />
        </label>
      </div>
      {list.isLoading ? (
        <div className="flex justify-center py-10" role="status"><Loader2 className="size-6 animate-spin text-primary" aria-label="Loading" /></div>
      ) : !list.data?.length ? (
        <EmptyState icon={<Shield />} title={q ? "No clubs match" : "No clubs yet"} description={q ? "Try another name or tag." : "Start the first one and invite your friends."} />
      ) : (
        <ol className="glass divide-y divide-white/5 overflow-hidden rounded-2xl">
          {list.data.map((c, i) => (
            <li key={c.id}>
              <button type="button" onClick={() => onOpen(c.id)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/5", c.id === myId && "bg-primary/15")}>
                <span className="w-6 font-display text-lg font-black">{i + 1}</span>
                <span className="flex size-9 items-center justify-center rounded-lg font-display text-xs font-black text-black" style={{ background: c.color }}>{c.tag}</span>
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{c.name}</span><span className="text-xs text-muted-foreground">{c.members}/30 members</span></span>
                <span className="font-bold tabular-nums">{c.points} pts</span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CreateClub() {
  const create = useCreateClub();
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]!);
  const valid = name.trim().length >= 3 && name.trim().length <= 32 && /^[A-Za-z0-9]{2,5}$/.test(tag.trim());
  return (
    <section className="glass h-fit rounded-3xl p-5">
      <h2 className="font-display text-2xl font-bold uppercase">Start a club</h2>
      <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); if (valid) create.mutate({ name: name.trim(), tag: tag.trim().toUpperCase(), description: description.trim(), color }); }}>
        <label className="block text-sm font-semibold">Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} className="mt-1 h-11 w-full rounded-xl bg-secondary px-3 font-normal outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <label className="block text-sm font-semibold">Tag <span className="font-normal text-muted-foreground">(2–5 letters or numbers)</span>
          <input value={tag} onChange={(e) => setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))} maxLength={5} className="mt-1 h-11 w-full rounded-xl bg-secondary px-3 font-normal uppercase outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <label className="block text-sm font-semibold">About <span className="font-normal text-muted-foreground">(optional)</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} rows={2} className="mt-1 w-full rounded-xl bg-secondary px-3 py-2 font-normal outline-none focus:ring-2 focus:ring-primary" />
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Colour</legend>
          <div className="mt-1 flex gap-2">
            {COLORS.map((c) => <button key={c} type="button" aria-label={c} aria-pressed={color === c} onClick={() => setColor(c)} className={cn("size-8 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-white")} style={{ background: c }} />)}
          </div>
        </fieldset>
        {create.isError && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
        <GameButton type="submit" variant="hot" className="w-full" disabled={!valid || create.isPending}><Shield aria-hidden /> {create.isPending ? "Creating…" : "Create club"}</GameButton>
      </form>
    </section>
  );
}
