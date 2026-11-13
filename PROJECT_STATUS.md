# PLAYVERSE — Project Status

_Last updated: 2026-11-12 · Current milestone: **1 — Application foundation**_

## Completed features
- Design system: navy/charcoal base, electric blue, orange and gold tokens; glass, gradient, glow and motion utilities (`src/styles.css`). Saira Condensed + Barlow fonts.
- Shared components (`src/components/game/`): GameButton, GlassPanel, StatPill, XPBar, PlayerBadge, PageShell, EmptyState, ComingSoon, SportCard, AvatarPreview, Logo, TopBar, SideNav/BottomTabBar, HeroStage, AuthLayout, FormField, FormStatus.
- Welcome/onboarding (`/`) with guest, register and login entry points.
- Character creation studio (`/character`): presentation, skin tone, face, hairstyle, hair colour, clothing + colour, shoes + colour, accessory, nickname; Save / Randomize / Reset. Stored as a validated `AvatarConfig` in localStorage. 2D preview, honestly labelled.
- Hub (`/hub`): top bar (avatar, name, level, XP, coins, friends online, notifications), parallax stadium hero with PLAY NOW, four sport destination cards.
- Sports selection and the four sport landing areas (`/sports`, `/sports/$sport`) with honest "coming later" mode cards.
- Login, Register, Password recovery forms with zod validation, wired to a single `authService` stub that reports "not connected".
- Profile, Settings (working toggles + reset guest data), Install guide, Privacy policy, Terms & competitive rules, More menu.
- Honest empty states: Friends, Notifications, Invitations, Match history, Rankings, Achievements, Tournaments, Help.
- Responsive navigation: desktop side nav, mobile bottom tab bar, safe-area insets.
- Web app manifest + SVG icon, theme colour, iOS standalone meta tags.

## In progress
- Nothing. Milestone 1 code is complete pending verification in the Lovable preview.

## Outstanding tasks
- PNG app icons (192/512) for full Android installability → Milestone 10.
- Service worker, install prompt flow → Milestone 10.
- Help & support content.
- Settings toggles (sound/music/haptics) are saved but have nothing to control until gameplay exists.

## Known bugs
- None confirmed. Milestone 1 completion files were written outside Lovable without a local dependency install, so a full typecheck/build has **not** been run yet — see Test results.

## Database status
- **Not connected.** All data is device-local (localStorage). Supabase auth + player schema is Milestone 2.

## Multiplayer status
- **Not started.** Colyseus authoritative server is Milestone 4 (to be hosted outside Lovable, e.g. Render). No multiplayer is simulated anywhere in the UI.

## Test results
- Added `src/test/schemas.test.ts` (avatar schema, register/login schemas, XP curve) alongside the existing routing test.
- Syntax check of all new files: passed.
- `vitest run`, `tsc` and `vite build`: **not yet run** (dependencies could not be installed in the authoring environment). Run in Lovable / CI to confirm.

## Deployment status
- Not published. Preview only: https://id-preview--b857ffc0-2276-46d4-aec2-187db99a0a1e.lovable.app

## Next milestone
- **Milestone 2 — Supabase authentication and player database**: email auth with verification, sessions, protected routes, 18-table schema with RLS, trusted server-side operations for XP/ratings/results.

## Notes
- Routing uses TanStack Router (fixed by the Lovable TanStack Start template) instead of React Router; same page structure.
