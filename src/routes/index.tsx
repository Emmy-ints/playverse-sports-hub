import { createFileRoute, Link } from "@tanstack/react-router";
import { Gamepad2, Swords, UserRound } from "lucide-react";
import stadium from "@/assets/hero-stadium.jpg";
import { GameButton } from "@/components/game/GameButton";
import { Logo } from "@/components/game/Logo";
import { avatarStore } from "@/lib/avatar";
import { SPORTS } from "@/lib/sports";

// The home route ships no og:image, so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PLAYVERSE — Four sports. One universe." },
      { name: "description", content: "Tennis, Bowling, Golf and Racing in one cross-platform multiplayer sports universe. Create your player and challenge your friends." },
      { property: "og:title", content: "PLAYVERSE — Four sports. One universe." },
      { property: "og:description", content: "Tennis, Bowling, Golf and Racing in one cross-platform multiplayer sports universe." },
    ],
  }),
  component: Welcome,
});

const STEPS = [
  { icon: UserRound, title: "Create your player", text: "Design your character in the studio." },
  { icon: Gamepad2, title: "Pick your arena", text: "Tennis, Bowling, Golf or Racing." },
  { icon: Swords, title: "Challenge friends", text: "Real-time matches on any device." },
];

function Welcome() {
  const avatar = avatarStore.useValue();
  return (
    <div className="relative isolate min-h-dvh overflow-hidden pb-safe pt-safe">
      <img src={stadium} alt="" width={1920} height={1088} fetchPriority="high" className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-background/30 via-background/70 to-background" />
      <div aria-hidden className="absolute bottom-1/2 left-[10%] -z-10 h-[120%] w-24 animate-beam bg-gradient-to-t from-primary-glow/40 to-transparent blur-2xl" />
      <div aria-hidden className="absolute bottom-1/2 right-[10%] -z-10 h-[120%] w-24 animate-beam bg-gradient-to-t from-primary-glow/40 to-transparent blur-2xl [animation-delay:-3s]" />

      <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-5 py-8">
        <Logo />
        <main className="flex flex-1 flex-col justify-center py-10">
          <p className="font-display text-sm font-bold uppercase tracking-[0.35em] text-accent animate-rise">Four sports · One universe</p>
          <h1 className="mt-3 max-w-3xl font-display text-6xl font-black uppercase italic leading-[0.88] animate-rise sm:text-8xl">
            Welcome to <span className="text-gradient-gold">Playverse</span>
          </h1>
          <p className="mt-4 max-w-xl text-lg text-foreground/85 animate-rise">
            Your next victory starts here. Build your player, pick your arena and challenge friends on any phone, tablet or computer.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row animate-rise">
            <GameButton asChild variant="hot" size="lg" shine>
              <Link to={avatar ? "/hub" : "/character"}>{avatar ? "Continue as guest" : "Play as guest"}</Link>
            </GameButton>
            <GameButton asChild variant="primary" size="lg">
              <Link to="/register">Create account</Link>
            </GameButton>
            <GameButton asChild variant="glass" size="lg">
              <Link to="/login">Log in</Link>
            </GameButton>
          </div>

          <ul className="mt-6 flex flex-wrap gap-2" aria-label="Sports">
            {SPORTS.map((s) => (
              <li key={s.id} className="glass rounded-full px-3 py-1 font-display text-sm font-bold uppercase tracking-wider">
                {s.venue}
              </li>
            ))}
          </ul>
        </main>

        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="glass flex items-center gap-3 rounded-2xl p-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-primary text-primary-foreground">
                <Icon className="size-5" aria-hidden />
              </span>
              <div>
                <p className="font-display text-lg font-bold uppercase leading-tight">
                  <span className="text-accent">{i + 1}.</span> {title}
                </p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
