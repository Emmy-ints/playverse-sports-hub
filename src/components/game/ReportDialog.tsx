import { Flag } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useReportPlayer, type PlayerSummary } from "@/lib/social";
import { cn } from "@/lib/utils";
import { GameButton } from "./GameButton";

const REASONS = [
  { id: "cheating", label: "Cheating" },
  { id: "harassment", label: "Harassment" },
  { id: "spam", label: "Spam" },
  { id: "inappropriate_name", label: "Inappropriate name" },
  { id: "other", label: "Other" },
] as const;

export function ReportButton({ player }: { player: PlayerSummary }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [details, setDetails] = useState("");
  const report = useReportPlayer();

  return (
    <>
      <GameButton variant="ghost" size="sm" onClick={() => setOpen(true)} aria-label={`Report ${player.display_name}`}>
        <Flag aria-hidden /> Report
      </GameButton>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) report.reset(); }}>
        <DialogContent className="glass border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-black uppercase">Report {player.display_name}</DialogTitle>
            <DialogDescription>Reports are reviewed by the PLAYVERSE team. Nobody is banned automatically.</DialogDescription>
          </DialogHeader>
          {report.isSuccess ? (
            <div className="space-y-4">
              <p role="status">Thanks — your report was submitted.</p>
              <GameButton variant="glass" className="w-full" onClick={() => setOpen(false)}>Close</GameButton>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    aria-pressed={reason === r.id}
                    onClick={() => setReason(r.id)}
                    className={cn("h-10 rounded-xl px-3 text-sm font-semibold", reason === r.id ? "bg-destructive text-destructive-foreground" : "bg-secondary hover:bg-muted")}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <textarea
                value={details}
                maxLength={1000}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                aria-label="Details"
                placeholder="What happened? (optional)"
                className="w-full rounded-xl border border-input bg-navy-deep/60 px-3 py-2 text-sm outline-none focus:border-primary"
              />
              {report.isError && <p role="alert" className="text-sm text-destructive">{report.error.message}</p>}
              <GameButton
                variant="hot"
                className="w-full"
                disabled={!reason || report.isPending}
                onClick={() => reason && report.mutate(details.trim() ? { target: player.id, reason, details: details.trim() } : { target: player.id, reason })}
              >
                {report.isPending ? "Sending…" : "Submit report"}
              </GameButton>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
