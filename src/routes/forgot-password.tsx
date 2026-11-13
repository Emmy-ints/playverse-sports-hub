import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout, NotConnectedNotice } from "@/components/game/AuthLayout";
import { FormField } from "@/components/game/FormField";
import { FormStatus } from "@/components/game/FormStatus";
import { GameButton } from "@/components/game/GameButton";
import { useAuthForm } from "@/hooks/use-auth-form";
import { recoverySchema } from "@/lib/auth-schemas";
import { authService } from "@/lib/auth-service";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Reset password — PLAYVERSE" },
      { name: "description", content: "Reset your PLAYVERSE password." },
      { property: "og:title", content: "Reset password — PLAYVERSE" },
      { property: "og:description", content: "Reset your PLAYVERSE password." },
    ],
  }),
  component: ForgotPassword,
});

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const { errors, pending, status, onSubmit } = useAuthForm(recoverySchema, authService.requestPasswordReset);
  return (
    <AuthLayout
      title="Reset password"
      subtitle="We'll email you a link to choose a new password."
      footer={<Link to="/login" className="font-semibold text-primary hover:underline">Back to log in</Link>}
    >
      <NotConnectedNotice />
      <form noValidate onSubmit={(e) => onSubmit(e, { email })} className="space-y-4">
        <FormField id="email" label="Email" type="email" autoComplete="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        <FormStatus status={status} />
        <GameButton type="submit" variant="hot" size="lg" className="w-full" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </GameButton>
      </form>
    </AuthLayout>
  );
}
