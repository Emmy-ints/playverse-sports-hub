# PLAYVERSE — Supabase configuration

Project: **playverse** (`piayiahsdcwvtocggyer`, region us-west-1, org "Disco Sundays CRM").
Dashboard: https://supabase.com/dashboard/project/piayiahsdcwvtocggyer

## Environment variables

| Variable | Where | Secret? | Notes |
|---|---|---|---|
| `VITE_SUPABASE_URL` | frontend | no | Defaults to `https://piayiahsdcwvtocggyer.supabase.co` in `src/lib/supabase.ts`. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | frontend | no | Publishable key; defaults in `src/lib/supabase.ts`. Safe in browsers — RLS protects data. |
| `SUPABASE_SERVICE_ROLE_KEY` | **game server only** (Milestone 4) | **YES** | Used by the Colyseus server to write verified results, XP and ratings. Never commit it or put it in frontend code. |

## Required dashboard settings (Authentication → URL Configuration)

- **Site URL:** the app's main URL (preview now, published domain later).
- **Redirect URLs:** add
  - `https://id-preview--b857ffc0-2276-46d4-aec2-187db99a0a1e.lovable.app/**`
  - the published Lovable URL / custom domain `/**` once published
  - `http://localhost:8080/**` for local development

Email confirmation is **on** (Supabase default). The built-in email sender is rate-limited
(a few emails per hour); configure custom SMTP under Authentication → Emails before launch.

## Security model

- RLS is enabled and **forced** on all 18 tables; `anon` has no table access.
- Signed-in players can only:
  - read public profile/stat/rating/achievement data and their own private rows;
  - update `display_name`, `avatar_config`, `country` on their **own** profile (column privileges);
  - mark their own notifications read;
  - file a player report as themselves.
- XP, level, coins, ratings, statistics, match results, achievements, inventory, sanctions and
  audit logs have **no client write access**. They are written only by trusted server code using
  the service role (Colyseus server / edge functions in later milestones).
- Sign-up creates the profile, unique public ID (`PV` + 8 chars), per-sport statistics and
  ratings (1000) via the `handle_new_user` trigger. Usernames are unique case-insensitively.
- `username_available(text)` is a public RPC that returns only true/false (used by the sign-up form).

Verified with SQL tests (rolled back): a signed-in player could not raise their own XP, coins,
rating or wins, write match results, edit another player's profile, read audit logs, or file a
report as someone else; editing their own display name worked.

## Schema

The applied SQL is in `docs/database/`. Apply changes with new migrations in the Supabase
project (not in `supabase/migrations/`, which Lovable manages for its own backend).
