import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import stadium from "@/assets/hero-stadium.jpg";
import { Logo } from "./Logo";

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh items-center justify-center px-4 pb-safe pt-safe">
      <img src={stadium} alt="" width={1920} height={1088} className="absolute inset-0 -z-20 h-full w-full object-cover opacity-40" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/60 via-background/85 to-background" />
      <div className="w-full max-w-md py-10 animate-rise">
        <Link to="/" className="mb-8 flex justify-center"><Logo /></Link>
        <div className="glass rounded-3xl p-6 sm:p-8">
          <h1 className="font-display text-4xl font-black uppercase">{title}</h1>
          <p className="mb-6 mt-1 text-sm text-muted-foreground">{subtitle}</p>
          {children}
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
