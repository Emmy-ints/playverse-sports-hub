import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { AuthLayout } from "@/components/game/AuthLayout";
import { GameButton } from "@/components/game/GameButton";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Confirming account — PLAYVERSE" },
      { name: "description", content: "Confirming your PLAYVERSE account." },
      { property: "og:title", content: "Confirming account — PLAYVERSE" },
      { property: "og:description", content: "Confirming your PLAYVERSE account." },
    ],
  }),
  component: AuthCallback,
});

/** Landing page for email-confirmation links. supabase-js exchanges the code in the URL automatically. */
function AuthCallback() {
  const navigate = useNavigate();
  const { status } = useSession();
  const [timedOut, setTimedOut] = useState(false);
  const urlError = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("error_description") : null;

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (status === "signed_in") {
      const t = setTimeout(() => navigate({ to: "/character" }), 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, navigate]);

  if (status === "signed_in") {
    return (
      <AuthLayout title="You're in!" subtitle="Your account is confirmed.">
        <CheckCircle2 className="mx-auto size-14 text-success" aria-hidden />
        <p className="mt-3 text-center text-muted-foreground">Taking you to the character studio…</p>
      </AuthLayout>
    );
  }
  if (urlError || (timedOut && status === "signed_out")) {
    return (
      <AuthLayout title="Link problem" subtitle={urlError ?? "This confirmation link is invalid or has expired."}>
        <XCircle className="mx-auto size-14 text-destructive" aria-hidden />
        <p className="mt-3 text-center text-sm text-muted-foreground">Log in to get a fresh confirmation email.</p>
        <GameButton asChild variant="hot" className="mt-5 w-full"><Link to="/login">Go to log in</Link></GameButton>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Confirming…" subtitle="Hang tight while we activate your account.">
      <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden />
    </AuthLayout>
  );
}
