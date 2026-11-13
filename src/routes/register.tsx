import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AuthLayout, NotConnectedNotice } from "@/components/game/AuthLayout";
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
  const [values, setValues] = useState({ username: "", email: "", password: "", confirmPassword: "", acceptTerms: false });
  const { errors, pending, status, onSubmit } = useAuthForm(registerSchema, authService.register);
  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues({ ...values, [k]: e.target.value });
  return (
    <AuthLayout
      title="Join Playverse"
      subtitle="One account. Four sports. Any device."
      footer={<>Already have an account? <Link to="/login" className="font-semibold text-primary hover:underline">Log in</Link></>}
    >
      <NotConnectedNotice />
      <form noValidate onSubmit={(e) => onSubmit(e, values)} className="space-y-4">
        <FormField id="username" label="Username" autoComplete="username" value={values.username} error={errors.username} onChange={set("username")} />
        <FormField id="email" label="Email" type="email" autoComplete="email" value={values.email} error={errors.email} onChange={set("email")} />
        <FormField id="password" label="Password" type="password" autoComplete="new-password" value={values.password} error={errors.password} onChange={set("password")} />
        <FormField id="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" value={values.confirmPassword} error={errors.confirmPassword} onChange={set("confirmPassword")} />
        <div>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              checked={values.acceptTerms}
              onChange={(e) => setValues({ ...values, acceptTerms: e.target.checked })}
              className="mt-0.5 size-5 accent-[var(--primary)]"
              aria-invalid={!!errors.acceptTerms}
            />
            <span>
              I accept the <Link to="/terms" className="font-semibold text-primary hover:underline">terms & competitive rules</Link> and the{" "}
              <Link to="/privacy" className="font-semibold text-primary hover:underline">privacy policy</Link>.
            </span>
          </label>
          {errors.acceptTerms && <p className="mt-1 text-sm text-destructive">{errors.acceptTerms}</p>}
        </div>
        <FormStatus status={status} />
        <GameButton type="submit" variant="hot" size="lg" className="w-full" disabled={pending}>
          {pending ? "Checking…" : "Create account"}
        </GameButton>
      </form>
    </AuthLayout>
  );
}
