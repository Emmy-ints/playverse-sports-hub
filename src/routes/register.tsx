import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MailCheck } from "lucide-react";
import { useState } from "react";
import { AuthLayout } from "@/components/game/AuthLayout";
import { FormField } from "@/components/game/FormField";
import { FormStatus } from "@/components/game/FormStatus";
import { GameButton } from "@/components/game/GameButton";
import { useAuthForm } from "@/hooks/use-auth-form";
import { registerSchema } from "@/lib/auth-schemas";
import { authService } from "@/lib/auth-service";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account — PLAYVERSE" },
      { name: "description", content: "Create your PLAYVERSE account." },
      { property: "og:title", content: "Create account — PLAYVERSE" },
      { property: "og:description", content: "Create your PLAYVERSE account." },
    ],
  }),
  component: Register,
});

function Register() {
  const navigate = useNavigate();
  const [values, setValues] = useState({ username: "", email: "", password: "", confirmPassword: "", acceptTerms: false });
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { errors, pending, status, onSubmit } = useAuthForm(registerSchema, authService.register, (res, data) => {
    if (res.message?.startsWith("Account created")) navigate({ to: "/character" });
    else setSentTo(data.email);
  });
  const set = (k: "username" | "email" | "password" | "confirmPassword") => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues({ ...values, [k]: e.target.value });

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" subtitle="One last step to activate your account.">
        <div className="space-y-4 text-center">
          <MailCheck className="mx-auto size-14 text-success" aria-hidden />
          <p>
            We sent a confirmation link to <strong>{sentTo}</strong>. Open it on this device to finish creating your account.
          </p>
          <p className="text-sm text-muted-foreground">Didn't get it? Check spam, or resend below.</p>
          <ResendButton email={sentTo} />
          <GameButton asChild variant="glass" className="w-full">
            <Link to="/login">Go to log in</Link>
          </GameButton>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Join Playverse"
      subtitle="One account. Four sports. Any device."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Log in</Link></>}
    >
      <form noValidate onSubmit={(e) => onSubmit(e, values)} className="space-y-4">
        <FormField id="username" label="Username" autoComplete="username" value={values.username} error={errors["username"]} onChange={set("username")} />
        <FormField id="email" label="Email" type="email" autoComplete="email" value={values.email} error={errors["email"]} onChange={set("email")} />
        <FormField id="password" label="Password" type="password" autoComplete="new-password" value={values.password} error={errors["password"]} onChange={set("password")} />
        <FormField id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" value={values.confirmPassword} error={errors["confirmPassword"]} onChange={set("confirmPassword")} />
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={values.acceptTerms}
              onChange={(e) => setValues({ ...values, acceptTerms: e.target.checked })}
              className="mt-0.5 size-5 accent-[var(--primary)]"
              aria-invalid={!!errors["acceptTerms"]}
            />
            <span>
              I accept the <Link to="/terms" className="font-semibold text-primary hover:underline">terms & competitive rules</Link> and the{" "}
              <Link to="/privacy" className="font-semibold text-primary hover:underline">privacy policy</Link>.
            </span>
          </label>
          {errors["acceptTerms"] && <p className="mt-1 text-sm text-destructive">{errors["acceptTerms"]}</p>}
        </div>
        <FormStatus status={status} />
        <GameButton type="submit" variant="hot" size="lg" className="w-full" disabled={pending}>
          {pending ? "Creating account…" : "Create account"}
        </GameButton>
      </form>
    </AuthLayout>
  );
}

function ResendButton({ email }: { email: string }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <GameButton
        variant="primary"
        className="w-full"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await authService.resendVerification(email);
          setMsg(res.ok ? (res.message ?? "Sent.") : res.message);
          setBusy(false);
        }}
      >
        {busy ? "Sending…" : "Resend email"}
      </GameButton>
      {msg && <p role="status" className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
