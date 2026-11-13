# PLAYVERSE — Project Status

_Last updated: 2026-11-12 · Current milestone: **3 — Friends, challenges & lobby** (complete, pending two-player live test)_

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

### Milestone 2 — Accounts & player database
- Supabase project `playverse` with 18 tables (profiles, friendships, friend_requests, match_invitations, matches, match_participants, match_results, player_statistics, player_ratings, achievements, player_achievements, player_inventory, notifications, tournaments, tournament_participants, player_reports, account_sanctions, audit_logs), foreign keys, indexes, constraints, timestamps.
- Row Level Security forced on every table + column privileges: players cannot change XP, level, coins, ratings, stats, results or other players' data. Verified by SQL tests.
- Sign-up trigger creates profile, unique public player ID, per-sport stats and ratings. Case-insensitive unique usernames.
- Real auth: register (with username check + email verification), login, logout, resend verification, password reset email, set new password, email-confirmation callback page, persistent sessions with auto refresh.
- Account-only sections (Friends, Notifications, Invitations, Match history) protected with a sign-in gate.
- Top bar, profile and character studio use the account profile when signed in; character saves to the account. Profile shows public ID and per-sport record/ratings from the server.
- Settings: account panel with sign out and change password.
- Docs: `docs/SUPABASE.md` (env vars, dashboard settings, security model).

### Milestone 3 — Friends, challenges & multiplayer lobby
- Friends page: friend list (online first), requests (accept/reject/cancel), find players by username or public ID, blocked list (unblock).
- Player profiles (`/players/$username`): character, level, live status, per-sport record/ratings, achievements; Add friend / Challenge / Block / Report.
- Presence via Supabase Realtime from real signed-in sessions: Online, Away (tab hidden), In lobby, Offline. Friends-online count in top bar.
- Challenge flow: pick sport → mode → length (sets/frames/holes/laps) → public/private → optional agreed rules. Validated client-side and re-validated by the server.
- Invitations page: incoming/outgoing with live 10-minute expiry countdown, accept/decline/cancel; accepting opens the lobby.
- Notifications page with live updates, unread badge, auto mark-as-read, deep links.
- Pre-match lobby (`/lobby/$matchId`): both characters, names, levels, sport, format, agreed rules, per-player connection status, ready toggles, 5-second countdown only when both are connected and ready (cancels if either un-readies or drops), leave lobby (abandons match with no result). Private realtime channel restricted to the match's active participants.
- Server (all as audited security-definer functions, rate limited): send/respond/cancel friend requests, remove friend, block/unblock, report, create/respond/cancel invitations, leave lobby, mark notifications read.

## In progress
- Nothing.

## Outstanding tasks
- PNG app icons (192/512) for full Android installability → Milestone 10.
- Service worker, install prompt flow → Milestone 10.
- Help & support content.
- Settings toggles (sound/music/haptics) are saved but have nothing to control until gameplay exists.

## Known bugs
- None confirmed. Code was written outside Lovable without a local dependency install; Lovable's build is the typecheck. See Test results.

## Blockers / setup needed
- Supabase dashboard → Authentication → URL Configuration: set Site URL and add the preview URL to Redirect URLs (see docs/SUPABASE.md), otherwise confirmation/reset emails link to localhost.
- Custom SMTP before launch (default Supabase email is rate-limited).

## Database status
- **Connected.** Supabase project `piayiahsdcwvtocggyer`. Schema + RLS applied and tested. Guests still use device-local storage.

## Multiplayer status
- Lobby, presence and ready-check are live (Supabase Realtime). **Gameplay server not started** — after the countdown the lobby honestly says live gameplay arrives with the game server (Milestone 4: Colyseus on Render). No gameplay or results are simulated.

## Test results
- Added `src/test/schemas.test.ts` (avatar schema, register/login schemas, XP curve) alongside the existing routing test.
- Added `src/test/auth-service.test.ts` (error mapping, new-password schema).
- Database security tests (SQL, rolled back): 10/10 passed after fixing a case-sensitivity bug in username checks.
- Supabase security advisor: only intentional findings (audit_logs has no client policies; username_available is public by design).
- Milestone 3 database tests (SQL, rolled back, 3 test players): 18/18 passed — duplicate requests, challenging non-friends, invalid formats, double invitations, accepting your own invite, outsiders viewing private matches or leaving others' lobbies, blocked players re-requesting, and forged notifications are all rejected.
- Bugs found and fixed during Milestone 3: infinite recursion between match and participant access policies; friendship deletes leaking through realtime (table removed from realtime).
- Added `src/test/match-config.test.ts` (formats, error mapping, time helpers).
- Syntax check of all new files: passed.
- `vitest run`, `tsc` and `vite build`: **not yet run** (dependencies could not be installed in the authoring environment). Run in Lovable / CI to confirm.

## Deployment status
- Not published. Preview only: https://id-preview--b857ffc0-2276-46d4-aec2-187db99a0a1e.lovable.app

## Next milestone
- **Milestone 4 — Real-time multiplayer server**: Colyseus (Node/TypeScript) on Render, authenticated with Supabase JWTs, authoritative rooms created from accepted matches, reconnection, input validation, server-written results via the service role, two-client automated test.

## Notes
- Routing uses TanStack Router (fixed by the Lovable TanStack Start template) instead of React Router; same page structure.
