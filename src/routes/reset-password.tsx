import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/game/AuthLayout";
import { FormField } from "@/components/game/FormField";
import { FormStatus } from "@/components/game/FormStatus";
import { GameButton } from "@/components/game/GameButton";
import { useAuthForm } from "@/hooks/use-auth-form";
import { newPasswordSchema } from "@/lib/auth-schemas";
import { authService } from "@/lib/auth-service";
import { useSession } from "@/lib/session";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Choose a new password — PLAYVERSE" },
      { name: "description", content: "Set a new password for your PLAYVERSE account." },
      { property: "og:title", content: "Choose a new password — PLAYVERSE" },
      { property: "og:description", content: "Set a new password for your PLAYVERSE account." },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const { status: sessionStatus } = useSession();
  const [values, setValues] = useState({ password: "", confirmPassword: "" });
  const { errors, pending, status, onSubmit } = useAuthForm(
    newPasswordSchema,
    (d) => authService.updatePassword(d.password),
    () => setTimeout(() => navigate({ to: "/hub" }), 1200),
  );

  if (sessionStatus === "loading") {
    return <AuthLayout title="One moment" subtitle="Checking your reset link…"><p className="text-muted-foreground">Loading…</p></AuthLayout>;
  }
  if (sessionStatus === "signed_out") {
    return (
      <AuthLayout title="Link expired" subtitle="This reset link is invalid or has expired.">
        <GameButton asChild variant="hot" className="w-full"><Link to="/forgot-password">Request a new link</Link></GameButton>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="New password" subtitle="Choose a new password for your account.">
      <form noValidate onSubmit={(e) => onSubmit(e, values)} className="space-y-4">
        <FormField id="password" label="New password" type="password" autoComplete="new-password" value={values.password} error={errors["password"]} onChange={(e) => setValues({ ...values, password: e.target.value })} />
        <FormField id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" value={values.confirmPassword} error={errors["confirmPassword"]} onChange={(e) => setValues({ ...values, confirmPassword: e.target.value })} />
        <FormStatus status={status} />
        <GameButton type="submit" variant="hot" size="lg" className="w-full" disabled={pending}>
          {pending ? "Saving…" : "Save password"}
        </GameButton>
      </form>
    </AuthLayout>
  );
}
