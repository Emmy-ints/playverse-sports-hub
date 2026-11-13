import { useState, type FormEvent } from "react";
import type { z } from "zod";
import type { AuthResult } from "@/lib/auth-service";
import { fieldErrors } from "@/lib/auth-schemas";

/** Shared submit logic for auth forms: zod validation → auth service call → status message. */
export function useAuthForm<S extends z.ZodTypeAny>(schema: S, submit: (data: z.infer<S>) => Promise<AuthResult>) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "error" | "success"; text: string } | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>, values: unknown) {
    e.preventDefault();
    setStatus(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const res = await submit(parsed.data);
      if (res.ok) setStatus({ tone: "success", text: "Done!" });
      else setStatus({ tone: res.reason === "not_connected" ? "info" : "error", text: res.message });
    } catch {
      setStatus({ tone: "error", text: "Something went wrong. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return { errors, pending, status, onSubmit };
}
