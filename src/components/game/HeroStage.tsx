import { Link } from "@tanstack/react-router";
import { Play } from "lucide-react";
import { useRef, type PointerEvent } from "react";
import stadium from "@/assets/hero-stadium.jpg";

function Trophy() {
  return (
    <svg viewBox="0 0 120 160" aria-hidden className="h-full w-full drop-shadow-[0_0_30px_var(--gold)]">
      <defs>
        <linearGradient id="tg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" /><stop offset="0.5" stopColor="oklch(0.95 0.08 95)" /><stop offset="1" stopColor="oklch(0.65 0.14 65)" />
        </linearGradient>
      </defs>
      <path d="M30 10 H90 V50 Q90 85 60 92 Q30 85 30 50Z" fill="url(#tg)" />
      <path d="M30 20 Q8 20 10 42 Q12 62 34 64" stroke="url(#tg)" strokeWidth="7" fill="none" />
      <path d="M90 20 Q112 20 110 42 Q108 62 86 64" stroke="url(#tg)" strokeWidth="7" fill="none" />
      <rect x="52" y="90" width="16" height="26" fill="url(#tg)" />
      <rect x="34" y="116" width="52" height="12" rx="3" fill="url(#tg)" />
      <rect x="26" y="128" width="68" height="18" rx="4" fill="var(--charcoal)" stroke="url(#tg)" strokeWidth="2" />
      <path d="M60 28 l5 11 12 1 -9 8 3 12 -11 -6 -11 6 3 -12 -9 -8 12 -1z" fill="oklch(1 0 0 / 0.55)" />
    </svg>
  );
}

/** Layered parallax stadium scene: photo, light beams, trophy, copy — each layer moves at a different depth. */
export function HeroStage() {
  const ref = useRef<HTMLDivElement>(null);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    ref.current.style.setProperty("--px", String((e.clientX - r.left) / r.width - 0.5));
    ref.current.style.setProperty("--py", String((e.clientY - r.top) / r.height - 0.5));
  };
  const layer = (depth: number) => ({ transform: `translate3d(calc(var(--px, 0) * ${depth}px), calc(var(--py, 0) * ${depth}px), 0)` });

  return (
    <section ref={ref} onPointerMove={onMove} className="relative isolate min-h-[30rem] overflow-hidden rounded-3xl shadow-card sm:min-h-[34rem]" aria-labelledby="hero-title">
      <div className="absolute -inset-6 -z-30 transition-transform duration-300 ease-out" style={layer(-18)}>
        <img src={stadium} alt="" width={1920} height={1088} fetchPriority="high" className="h-full w-full object-cover" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-20 transition-transform duration-300 ease-out" style={layer(-34)}>
        <div className="absolute bottom-1/3 left-[12%] h-[140%] w-24 animate-beam bg-gradient-to-t from-primary-glow/40 to-transparent blur-2xl" />
        <div className="absolute bottom-1/3 right-[12%] h-[140%] w-24 animate-beam bg-gradient-to-t from-primary-glow/40 to-transparent blur-2xl [animation-delay:-3s]" />
      </div>
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-background via-background/40 to-transparent" />
      <div aria-hidden className="absolute bottom-10 right-4 -z-10 h-44 w-32 animate-float transition-transform duration-300 ease-out sm:right-12 sm:h-64 sm:w-48" style={layer(28)}>
        <Trophy />
      </div>
      <div className="flex min-h-[inherit] flex-col justify-end p-6 sm:p-10" style={layer(10)}>
        <p className="font-display text-sm font-bold uppercase tracking-[0.35em] text-accent animate-rise">Season 0 · Pre-launch</p>
        <h1 id="hero-title" className="mt-2 max-w-2xl font-display text-5xl font-black uppercase italic leading-[0.9] animate-rise sm:text-7xl">
          Welcome to <span className="text-gradient-gold">Playverse</span>
        </h1>
        <p className="mt-3 font-display text-xl font-semibold uppercase tracking-wider text-foreground/85 animate-rise sm:text-2xl">Your next victory starts here.</p>
        <Link to="/sports" className="mt-6 inline-flex h-16 w-fit items-center gap-3 overflow-hidden rounded-2xl bg-gradient-hot px-10 font-display text-2xl font-black uppercase tracking-wider text-accent-foreground shadow-hot transition-all hover:-translate-y-1 hover:brightness-110 active:scale-95 sm:h-20 sm:px-14 sm:text-3xl">
          <Play className="size-7 fill-current" aria-hidden /> Play now
        </Link>
      </div>
    </section>
  );
}
