import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout } from "@/components/game/AuthLayout";
import { FormField } from "@/components/game/FormField";
import { FormStatus } from "@/components/game/FormStatus";
import { GameButton } from "@/components/game/GameButton";
import { useAuthForm } from "@/hooks/use-auth-form";
import { loginSchema } from "@/lib/auth-schemas";
import { authService } from "@/lib/auth-service";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Log in — PLAYVERSE" },
      { name: "description", content: "Log in to your PLAYVERSE account." },
      { property: "og:title", content: "Log in — PLAYVERSE" },
      { property: "og:description", content: "Log in to your PLAYVERSE account." },
    ],
  }),
  component: Login,
});

function Login() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ email: "", password: "" });
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const { errors, pending, status, lastFailure, onSubmit } = useAuthForm(loginSchema, authService.signIn, () => {
    navigate({ to: "/hub" });
  });

  const resend = async () => {
    const res = await authService.resendVerification(values.email.trim());
    setResendMsg(res.ok ? (res.message ?? "Sent.") : res.message);
  };

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back to the arena."
      footer={<>New here? <Link to="/register" className="font-semibold text-primary hover:underline">Create an account</Link></>}
    >
      <form noValidate onSubmit={(e) => onSubmit(e, values)} className="space-y-4">
        <FormField id="email" label="Email" type="email" autoComplete="email" value={values.email} error={errors["email"]} onChange={(e) => setValues({ ...values, email: e.target.value })} />
        <FormField id="password" label="Password" type="password" autoComplete="current-password" value={values.password} error={errors["password"]} onChange={(e) => setValues({ ...values, password: e.target.value })} />
        <div className="text-right">
          <Link to="/forgot-password" className="text-sm font-semibold text-muted-foreground hover:text-foreground">Forgot password?</Link>
        </div>
        <FormStatus status={status} />
        {lastFailure === "unverified" && (
          <div className="text-sm">
            <button type="button" onClick={resend} className="font-semibold text-primary hover:underline">Resend confirmation email</button>
            {resendMsg && <p className="mt-1 text-muted-foreground">{resendMsg}</p>}
          </div>
        )}
        <GameButton type="submit" variant="hot" size="lg" className="w-full" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </GameButton>
        <GameButton asChild variant="ghost" className="w-full">
          <Link to="/hub">Continue as guest</Link>
        </GameButton>
      </form>
    </AuthLayout>
  );
}
