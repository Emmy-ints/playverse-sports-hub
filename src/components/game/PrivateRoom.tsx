import { useNavigate } from "@tanstack/react-router";
import { DoorOpen, KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";
import { MATCH_FORMATS, type MatchConfig } from "@/lib/match-config";
import { useSession } from "@/lib/session";
import { createRoom, joinRoom } from "@/lib/social";
import { SPORTS, type SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";
import { GameButton } from "./GameButton";

/**
 * Private rooms: create a room for a sport and share its 6-character code, or join a friend's room
 * by typing the code. Works between any phones and browsers — the room lives on the server.
 */
export function PrivateRoomCard({ sport: fixed }: { sport?: SportId }) {
  const { session } = useSession();
  const navigate = useNavigate();
  const [sport, setSport] = useState<SportId>(fixed ?? "tennis");
  const f = MATCH_FORMATS[sport];
  const [mode, setMode] = useState<string>(f.defaultMode);
  const [length, setLength] = useState<number>(f.defaultLength);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pickSport = (s: SportId) => {
    setSport(s);
    setMode(MATCH_FORMATS[s].defaultMode);
    setLength(MATCH_FORMATS[s].defaultLength);
  };

  if (!session) {
    return (
      <div className="glass rounded-2xl p-6">
        <h2 className="text-2xl font-bold uppercase">Private room</h2>
        <p className="mt-1 text-sm text-muted-foreground">Log in to create a room or join one with a code.</p>
      </div>
    );
  }

  const create = async () => {
    setError(null);
    setBusy("create");
    try {
      const cfg: MatchConfig = { mode, length, public: false };
      const r = await createRoom(sport, cfg);
      navigate({ to: "/lobby/$matchId", params: { matchId: r.match_id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the room.");
    } finally {
      setBusy(null);
    }
  };
  const join = async () => {
    setError(null);
    if (code.trim().length !== 6) return setError("Room codes have 6 characters.");
    setBusy("join");
    try {
      const id = await joinRoom(code);
      navigate({ to: "/lobby/$matchId", params: { matchId: id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't join the room.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="glass rounded-2xl p-6">
      <h2 className="flex items-center gap-2 text-2xl font-bold uppercase"><KeyRound className="size-6 text-primary" aria-hidden /> Private room</h2>
      <p className="mt-1 text-sm text-muted-foreground">Create a room and share the code, or enter a friend's code. Works across any phones.</p>

      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void join(); }}>
        <label className="sr-only" htmlFor={`room-code-${fixed ?? "any"}`}>Room code</label>
        <input id={`room-code-${fixed ?? "any"}`} value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))}
          placeholder="ROOM CODE" inputMode="text" autoCapitalize="characters" autoComplete="off"
          className="min-w-0 flex-1 rounded-xl border border-border bg-background/60 px-3 py-2 text-center font-display text-xl font-black tracking-[0.3em]" />
        <GameButton type="submit" variant="primary" disabled={busy !== null}>{busy === "join" ? <Loader2 className="animate-spin" aria-hidden /> : <DoorOpen aria-hidden />} Join</GameButton>
      </form>

      <div className="mt-5 space-y-3 border-t border-border/60 pt-4">
        {!fixed && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sport">
            {SPORTS.map((s) => (
              <button key={s.id} type="button" aria-pressed={sport === s.id} onClick={() => pickSport(s.id)}
                className={cn("rounded-full px-3 py-1.5 text-sm font-bold", sport === s.id ? "bg-primary text-primary-foreground" : "bg-muted/60 hover:bg-muted")}>{s.name}</button>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Format">
          {f.modes.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} title={m.hint} onClick={() => setMode(m.id)}
              className={cn("rounded-full px-3 py-1.5 text-sm font-bold", mode === m.id ? "bg-white text-black" : "bg-muted/60 hover:bg-muted")}>{m.label}</button>
          ))}
          {f.lengths.length > 1 && f.lengths.map((n) => (
            <button key={n} type="button" aria-pressed={length === n} onClick={() => setLength(n)}
              className={cn("rounded-full px-3 py-1.5 text-sm font-bold", length === n ? "bg-white text-black" : "bg-muted/60 hover:bg-muted")}>{f.unit(n)}</button>
          ))}
        </div>
        <GameButton variant="hot" onClick={() => void create()} disabled={busy !== null}>{busy === "create" && <Loader2 className="animate-spin" aria-hidden />} Create room</GameButton>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </div>
  );
}
