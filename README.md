# Playverse Sports Hub

PLAYVERSE — Milestone 1: Application foundation.

PLAYVERSE is a cross-platform 3D multiplayer sports gaming PWA (Tennis, Bowling, Golf, Racing). It is a shared sports gaming universe: players create characters, add friends, challenge each other, compete in real-time matches, earn achievements and build rivalries. It must become a genuine playable game product — NOT a landing page or mockup.

Architecture (whole project): React + TypeScript (strict) + Tailwind, PlayCanvas engine for 3D (added in later milestones), Supabase for auth/Postgres, a separate Colyseus (Node/TS) authoritative multiplayer server hosted outside Lovable (later milestone), PWA manifest + service worker. One shared platform with four sport modules — not four separate apps.

Non-negotiables: every visible control has a real function (if a feature isn't built yet, show an honest "Coming in a later update" state, never a fake); never fake multiplayer, fake players, fake match results, or fake populated leaderboards — use proper empty states; no secrets in frontend code; accessible, responsive controls; meaningful loading/error/empty/success states; good performance on ordinary phones.

THIS MILESTONE — build the foundation only (no sports gameplay, no auth backend yet):

A. Brand: premium, high-energy sports gaming identity, like an established international game. Deep navy + charcoal foundations, electric blue accents, vibrant orange highlights, championship gold. Bold display typography (e.g. a condensed sporty display font + clean sans for body), cinematic gradients, subtle glass effects, crafted shadows, fluid transitions, strong hover/press feedback. Avoid generic SaaS dashboard look — it should feel like a mobile game hub. Build a shared design system (tokens in index.css/tailwind config, reusable components: GameButton, SportCard, StatPill, XPBar, PlayerBadge, GlassPanel, PageShell, EmptyState, ComingSoon).

B. Pages/routes (React Router): Welcome/onboarding, Register, Login, Password recovery, Character creation, Main dashboard (hub), Sports selection, Tennis/Bowling/Golf/Racing landing areas, Player profile, Friends, Notifications, Match invitations, Match history, Rankings, Achievements, Tournaments, Settings, Install guide, Help & support, Privacy policy, Terms & competitive rules. Auth forms should be built with validation (zod) but clearly not yet connected — wire them to a single auth service module stub that we'll connect to Supabase next milestone.

C. Dashboard: top bar with avatar, username, level, XP progress, notifications, friend status, coin balance (use a local guest profile with level 1 / 0 XP / 0 coins — no fake numbers). Hero: "WELCOME TO PLAYVERSE" / "YOUR NEXT VICTORY STARTS HERE." with a dramatic 3D-inspired stadium-at-sunset scene (CSS/SVG layered parallax, stadium lights, trophy) and a big PLAY NOW button (goes to sports selection). Below: four large sport destination cards (Tennis Arena, Bowling Zone, Golf World, Racing Circuit) each with distinct artwork/color mood, name, short description, Play button, multiplayer indicator, available modes, animated hover/touch states.

D. Character creation studio: customize gender presentation, skin tone, face, hairstyle, hair colour, clothing, shoes, accessories, nickname. Save the configuration as a typed AvatarConfig object (persist to localStorage for now). Show a stylized 2D preview and label it honestly as a preview — the 3D viewer comes later.

E. Responsive: Android/iPhone/tablet/desktop, portrait navigation (bottom tab bar on mobile, side nav on desktop), safe-area insets, landscape-ready layout.

F. Add a PROJECT_STATUS.md at the repo root listing completed features, in-progress, outstanding tasks, known bugs, database status (not connected), multiplayer status (not started), test results, deployment status, next milestone (Supabase auth + player database). Keep components small and modular. At the end, report honestly what works and what remains.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b857ffc0-2276-46d4-aec2-187db99a0a1e).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
