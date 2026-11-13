import { cn } from "@/lib/utils";

export function FormStatus({ status }: { status: { tone: "info" | "error" | "success"; text: string } | null }) {
  if (!status) return null;
  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        status.tone === "error" && "border-destructive/50 bg-destructive/10",
        status.tone === "info" && "border-accent/40 bg-accent/10",
        status.tone === "success" && "border-success/50 bg-success/10",
      )}
    >
      {status.text}
    </p>
  );
}
