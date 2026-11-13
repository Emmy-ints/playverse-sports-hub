import { Link } from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";
import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { EmptyState } from "./EmptyState";
import { GameButton } from "./GameButton";

/**
 * Protects account-only sections. Sessions live in the browser, so the check runs client-side;
 * the database's Row Level Security is the real protection for the data itself.
 */
export function RequireAccount({ feature, children }: { feature: string; children: ReactNode }) {
  const { status } = useSession();
  if (status === "loading") {
    return (
      <div className="flex justify-center py-16" role="status" aria-label="Loading">
        <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
      </div>
    );
  }
  if (status === "signed_out") {
    return (
      <EmptyState
        icon={<LockKeyhole />}
        title="Account required"
        description={`${feature} needs a PLAYVERSE account so your progress is saved and other players can find you.`}
        action={
          <>
            <GameButton asChild variant="hot"><Link to="/register">Create account</Link></GameButton>
            <GameButton asChild variant="glass"><Link to="/login">Log in</Link></GameButton>
          </>
        }
      />
    );
  }
  return <>{children}</>;
}
