import { useNavigate } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { describeConfig, isValidConfig, MATCH_FORMATS, type MatchConfig } from "@/lib/match-config";
import { useCreateInvitation, type PlayerSummary } from "@/lib/social";
import { SPORTS, type SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";
import { GameButton } from "./GameButton";

export function ChallengeButton({ player, size = "sm" }: { player: PlayerSummary; size?: "sm" | "md" | "lg" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GameButton variant="hot" size={size} onClick={() => setOpen(true)}>
        <Swords aria-hidden /> Challenge
      </GameButton>
      {open && <ChallengeDialog player={player} open={open} onOpenChange={setOpen} />}
    </>
  );
}

function ChallengeDialog({ player, open, onOpenChange }: { player: PlayerSummary; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const create = useCreateInvitation();
  const [sport, setSport] = useState<SportId | null>(null);
  const [config, setConfig] = useState<MatchConfig>({ mode: "", length: 0, public: false });
  const [rules, setRules] = useState("");

  const chooseSport = (s: SportId) => {
    const f = MATCH_FORMATS[s];
    setSport(s);
    setConfig({ mode: f.defaultMode, length: f.defaultLength, public: false });
  };

  const send = () => {
    if (!sport) return;
    const cfg: MatchConfig = rules.trim() ? { ...config, rules: rules.trim() } : config;
    if (!isValidConfig(sport, cfg)) return;
    create.mutate(
      { target: player.id, sport, config: cfg },
      {
        onSuccess: () => {
          onOpenChange(false);
          navigate({ to: "/invitations" });
        },
      },
    );
  };

  const f = sport ? MATCH_FORMATS[sport] : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[90dvh] overflow-y-auto border-border sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-3xl font-black uppercase">Challenge {player.display_name}</DialogTitle>
          <DialogDescription>{sport ? "Set up the match. Both of you will see these exact settings." : "Pick a sport."}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {SPORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={sport === s.id}
              onClick={() => chooseSport(s.id)}
              className={cn(
                "relative h-20 overflow-hidden rounded-xl text-left ring-2 transition-all active:scale-95",
                sport === s.id ? "ring-accent" : "ring-transparent hover:ring-border",
              )}
            >
              <img src={s.image} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
              <span className="relative block p-3 font-display text-xl font-black uppercase drop-shadow">{s.name}</span>
            </button>
          ))}
        </div>

        {sport && f && (
          <div className="space-y-4">
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Game mode</legend>
              <div className="grid gap-2">
                {f.modes.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={config.mode === m.id}
                    onClick={() => setConfig({ ...config, mode: m.id })}
                    className={cn("rounded-xl px-4 py-2.5 text-left", config.mode === m.id ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}
                  >
                    <span className="font-semibold">{m.label}</span>
                    <span className="block text-xs opacity-80">{m.hint}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset>
              <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Length</legend>
              <div className="flex flex-wrap gap-2">
                {f.lengths.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={config.length === n}
                    onClick={() => setConfig({ ...config, length: n })}
                    className={cn("h-10 rounded-xl px-4 text-sm font-semibold", config.length === n ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-muted")}
                  >
                    {f.unit(n)}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" checked={config.public} onChange={(e) => setConfig({ ...config, public: e.target.checked })} className="size-5 accent-[var(--primary)]" />
              Public match (others can see the result)
            </label>
            <div>
              <label htmlFor="rules" className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">Agreed rules (optional)</label>
              <textarea
                id="rules"
                value={rules}
                maxLength={200}
                onChange={(e) => setRules(e.target.value)}
                rows={2}
                className="w-full rounded-xl border border-input bg-navy-deep/60 px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="e.g. Loser buys coffee"
              />
            </div>
            <p className="rounded-xl bg-secondary/60 px-3 py-2 text-sm">
              <strong className="font-display uppercase">{SPORTS.find((s) => s.id === sport)?.name}</strong> · {describeConfig(sport, config)}
              <span className="block text-xs text-muted-foreground">Challenge expires after 10 minutes.</span>
            </p>
            {create.isError && <p role="alert" className="text-sm text-destructive">{create.error.message}</p>}
            <GameButton variant="hot" size="lg" className="w-full" disabled={create.isPending || !isValidConfig(sport, config)} onClick={send}>
              {create.isPending ? "Sending…" : "Send challenge"}
            </GameButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
