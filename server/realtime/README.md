# PLAYVERSE real-time game server

Authoritative WebSocket server for live 1v1 tennis and racing. Plain Node 22, **no npm dependencies**:
it imports the shared game code from `src/game/tennis/*.ts` directly.

```
node --experimental-strip-types server/realtime/main.ts      # run
node --experimental-strip-types server/realtime/selftest.ts         # tennis end-to-end test (mock database)
node --experimental-strip-types server/realtime/selftest-racing.ts  # racing end-to-end test (mock database)
```

Environment (set on Render, never in the repo):

| Variable | Meaning |
| --- | --- |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_ANON_KEY` | Publishable key (public) |
| `REALTIME_SECRET` | Random secret; the database stores only its SHA-256 hash in `app_private.realtime_secret` |
| `ALLOWED_ORIGINS` | Comma-separated host suffixes allowed to connect (default `lovable.app,lovableproject.com,localhost`) |
| `PORT` | Set by Render |

Flow: lobby countdown → `start_realtime_match(match)` (player RPC) → client opens `wss://…/play` and sends
`{t:"join", match, token}` → server checks the Supabase token and that the user is a participant
(`realtime_match_info`, secret-protected) → 60 Hz simulation, 30 Hz snapshots → on match end or a
30 s disconnect, the server calls `realtime_settle_tennis` (secret-protected, idempotent) which records
the result, ratings, XP, coins, achievements and notifications. Racing works the same way with
`realtime_settle_racing`.

Deploys are manual for now (see PROJECT_STATUS.md → Blockers).

Rotate the secret: generate a new one, update `app_private.realtime_secret.hash` with its SHA-256, then
update `REALTIME_SECRET` on Render.
