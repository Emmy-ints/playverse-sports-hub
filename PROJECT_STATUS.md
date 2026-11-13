# PLAYVERSE — Project Status

_Last updated: 2026-11-12 · Current milestone: **7 — Golf** (playable: practice + server-authoritative online 1v1). Bowling polished._

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

### Milestone 5 — Bowling (first playable sport)
- Regulation geometry (USBC lane, pin spots, pin profile, ball). Rapier rigid-body physics: oiled front / dry back end, hook from side spin, real pin-on-pin collisions, pit, kickbacks. Nothing scripted.
- PlayCanvas alley: Poly Haven studio HDR lighting (CC0), lacquered maple lane with clear-coat oil sheen and targeting arrows, lathe-modelled pins from the USBC profile, resin-swirl ball with finger holes, gutters, neighbouring lanes, neon rails, PLAYVERSE masking signs, spot-lit pin deck with shadows, ACES tone mapping. Chase camera → pin cam with slow-motion at impact. Synthesised rolling/crash sounds.
- Controls: swipe up to bowl (speed = power, direction = aim, curl = hook), hold-to-roll power meter, position/aim/hook sliders, keyboard (←/→, A/D, Q/E, Space). High / Lite graphics (auto Lite on phones).
- Practice mode (`/play/bowling`): full 10-frame game, physics in the browser, not ranked.
- Online 1v1 (`/match/bowling/$matchId`), 3/5/10 frames: lobby countdown starts the game; every throw is simulated **on the server** (`bowling-throw` edge function, Rapier in Deno) and recorded atomically with turn and sequence checks; the opponent sees each throw replayed live; final results, Elo ratings (bowling + overall), XP, coins, achievements and notifications are written by the server. Results screen with rematch.

### Bowling polish
- Animated bowler built from the player's own character (skin, hair, outfit, shoes, accessories): four-step approach, pushaway, backswing, release, slide, follow-through; strike/spare/miss reactions; the opponent's own character bowls their replays.
- Spectator stands on both sides (clap on spares, jump and cheer on strikes), ball-return machines, bloom glow on High graphics.

### Milestone 7 — Golf
- Procedural 18-hole par-72 course generator: doglegs, fairways, sloped greens, bunkers, water, trees, per-hole wind.
- Ball-flight physics: drag, Magnus lift from backspin, hook/slice from tilted spin axis, wind; bounce/roll by surface (fairway, rough, green, fringe, bunker) and slope; cup capture; water (+1 drop) and out-of-bounds (stroke and distance). 8 clubs with realistic carries (driver ~242 m carry, 7-iron ~157 m, SW ~86 m); lie penalties.
- 3D course: real-photo HDR skies (Oceanfront Links, Countryside Championship, Moonlight Night Golf), sun with cascaded shadows, sculpted terrain with painted course map and mowing stripes, trees and palms, flag and cup, night floodlights. Golfer swing (and putting stroke) animated on the player's character with a club; TV-style shot tracer; hole fly-in; chase camera.
- Controls: drag to aim, club picker (auto-suggested), swing meter (hold for power, tap the line for accuracy — early hooks, late slices), live predicted landing / putt line, keyboard.
- Practice (`/play/golf`): choose course and 3/9/18 holes; scorecard; pick-up at double par.
- Online 1v1 (`/match/golf/$matchId`): stroke play or match play; lobby countdown starts the round; every shot simulated **on the server** (`golf-shot` edge function, importing the exact rule files from this repo at a pinned commit); farthest-from-hole plays first, honours on the next tee; settlement with ratings, XP, coins, achievements (birdie, hole-in-one), notifications; results + rematch.

### Milestone 4 — Real-time game server
- `server/realtime/`: plain Node 22 WebSocket server, **no npm dependencies** (a small audited RFC 6455 implementation), running the shared game code from `src/game/*` directly. Deployed on Render (free web service `playverse-realtime`, https://playverse-realtime.onrender.com, auto-deploys from `main`). The free plan sleeps when idle; the lobby wakes it early and the client shows "Waking up the game server…".
- Chosen instead of Colyseus so the exact server could be run and tested end to end in the authoring environment; it provides the same guarantees (authoritative rooms per match, auth, reconnection, rate limits).
- Security: Supabase access token verified on join; only the match's two participants can join; origin allow-list; 16 KB message cap; per-socket rate limit; 8 connections per IP; heartbeat. Results are written only through `realtime_settle_tennis(secret, …)` — the database stores a SHA-256 hash of the secret (`app_private.realtime_secret`), the plain secret exists only in Render's environment. Idempotent settlement with retries.
- Reconnection: a dropped player has 30 s to come back (the match pauses); otherwise they forfeit. No-show after 120 s forfeits.

### Milestone 6 — Tennis
- Rules: points, deuce/advantage, games, tiebreak at games-all, sets, best of 1/3/5, quick (4-game) or standard (6-game) sets; service rotation (including tiebreaks), deuce/ad court, faults and double faults, lets on the net tape handled as faults.
- Physics: drag, topspin/slice, surface-specific bounce (hard, clay, grass, indoor), net collision, in/out calls, double bounce; shot error grows with power, incoming pace, running and an awkward contact point; power-shot meter.
- Five venues (Harbour Hard Court, Terre Battue clay, Lawn Club grass, Arena Indoor, Night Session) with painted courts, net, sponsor boards, stands full of animated spectators, umpire in the chair, live scoreboards, floodlights; players are the users' characters with rackets and run / forehand / backhand / serve animations; broadcast camera (portrait-aware on phones).
- Controls: keyboard (WASD/arrows, Shift sprint, J/Space topspin, K flat, L lob, U drop, E power shot — hold to charge, release as the ball arrives, aim with left/right) and touch (joystick + shot buttons). Optional auto-run.
- Umpire calls (browser speech), synthesised racket/bounce sounds, applause and "ooh"s.
- Practice (`/play/tennis`) vs Rookie/Pro/Champion AI. Online 1v1 (`/match/tennis/$matchId`) from the lobby, server-authoritative at 60 Hz with 30 Hz snapshots; results, ratings, XP, coins, `tennis_ace` achievement, notifications; rematch.

### Milestone 8 — Racing
- Three circuits built from splines: Neon City Circuit (night streets), Coastal Ridge (seaside sweepers), Valley Ring (countryside hairpin and esses).
- Car handling: engine and gears feel, drag, braking and reverse, tyre grip with slides, handbrake drifts, slower on grass, bouncing off tyre walls, car-to-car contact; laps, best laps, live positions, wrong-way warning, "back on track" reset when stuck; AI drivers that brake for corners using track curvature.
- 3D: asphalt with racing line, red/white kerbs on corners, branded tyre walls (neon at night), start gantry with chequered line, grandstand with fans, city towers with lit windows and street lights / palms, rocks and sea / trees and hills; detailed cars (spinning and steering wheels, brake lights, headlights, driver helmet in the player's kit colour), tyre smoke, chase camera that tightens at speed; engine with gear changes, tyre squeal, impacts, start lights and beeps; HUD with position, lap, timer, last/best lap, speed and a live minimap.
- Controls: keyboard (W/S/A/D or arrows, Space drift, R reset) and touch (steer buttons, gas, brake, drift; auto-gas on phones).
- Practice (`/play/racing`): circuit, 1/3/5 laps, 1/3/5 AI drivers, Rookie/Pro/Champion, car colour. Online 1v1 (`/match/racing/$matchId`) from the lobby on the real-time game server, settled by `realtime_settle_racing` (ratings, XP, coins, `racing_podium`, best lap per track).

### Online responsiveness, bowling atmosphere, competitive features, PWA
- Instant response: tennis and racing predict your own movement/car locally and reconcile with the server (checked with a 150 ms-latency simulation: < 10 cm error); bowling and golf start the run-up/swing the moment you let go while the server simulates.
- Bowling: wider hall with lit spectator galleries full of fans, a lounge crowd behind the approach, neighbouring bowlers taking turns, big screen, confetti, applause, STRIKE!/SPARE! banners, off-axis camera.
- Match history (`/history`), rankings (`/rankings`, global/friends, per sport + overall), friend tournaments (`/tournaments`, `/tournament/$id`: 4/8-player knockout brackets, auto-advance on results), installable app (PNG/maskable icons, service worker, install button). Tournament flow tested in SQL (rolled back): brackets, advancement, draw tie-break by seed, champion and positions.
- Known gap: if a player leaves a tournament match lobby, that bracket match is abandoned and the bracket waits (host can't reassign yet).

### Milestone 9 — Athletics (new sport)
- Original athletes (no licensed characters) in a full stadium: oval track, grandstand crowds, floodlights, scoreboard, TV-style cameras, stadium audio (gun, crowd, footsteps, sand, announcer).
- Events: 100m, 110m hurdles, long jump, javelin — single events or a four-event championship with points (10/8/6/5/4/3).
- Controls: alternate left/right in rhythm to run (lit-arrow prompt), Space/button to jump or throw, angle meter for the field events, false starts, fouls, three attempts.
- Practice against 1–5 AI rivals; **live 1v1 online** on the real-time server (two players + four AI lanes), instant local response with server reconciliation, server-settled results/ratings/XP, `athletics_gold` achievement, rankings scope.

### Milestone 10 — Parkour: Rooftop Rush (new sport, complete)
- Original free-runners race across seeded rooftop courses three lanes wide at sunset. You run automatically; **steer between lanes** and use **contextual moves**: jump gaps, **vault** vents and railings (hand-plant), **climb** walls to higher roofs, **grab** swing bars over gaps too wide to jump, **slide** under pipes, and **roll** to absorb big drops (hard landing otherwise). "Choice" obstacles (vent in some lanes, pipe in others) let you pick a move or steer round. Speed pads per lane; Perfect moves give speed; combos.
- The move prompt shows what's next and lights up a reaction-time (0.25 s, speed-aware) before the ideal moment; coyote-time jumps; three misses at a gap and you're helped across. Tested: a player pressing when the prompt lights with 0.15–0.35 s reaction runs every course clean.
- Controls: keyboard ←/→ or A/D steer, Space/W action, ↓/S slide/roll; touch: steering pad (one thumb), big contextual Action button + Slide/Roll button (other thumb), swipes on open screen (one move per swipe), mouse click = action. Left-handed swap.
- Camera: third-person chase behind the runner, looks ahead (more at speed), rises for climbs/swings, pulls back for big jumps and speed, never below a roof or behind a wall face between it and the runner; no shake.
- Practice vs 1–3 computer runners (Sprint/Standard/Marathon, Rookie/Pro/Legend; AI reacts to the same prompts with skill-based reaction times) and **live 1v1 online** on the real-time server (2 players + 2 computer runners), server-settled results/ratings/XP, `parkour_king` achievement, rankings.

### Mobile controls & camera overhaul (all six arenas)
- **Shared:** one Controls & Camera settings store saved on the device (Settings page + in-game gear button): button size 80–140 %, camera/drag sensitivity, camera behaviour Dynamic/Steady/Manual, right/left-handed, haptics on/off, racing steering (wheel/buttons/tilt) and racing camera (chase/close/bonnet/cockpit), landscape suggestion. Controls sized from the screen (vmin) × button size, placed inside notch/safe areas; pinch/double-tap zoom, long-press menus and pull-to-refresh blocked on game screens; "turn your phone sideways" hint (dismissable); full-screen button locks landscape on Android; touch vs keyboard follows the input actually used.
- **Tennis:** floating joystick (appears under the thumb, sensitivity setting), Topspin / Smash / Lob / Slice (labels for the existing topspin/flat/lob/drop shots), hold-to-charge kept, swipe sideways on a shot button to aim; auto-run off by default. Camera: elevated baseline per player (each player sees from their own end online), tracks you sideways, moves in and lower for net play, lifts for lobs/high balls.
- **Bowling:** drag sideways to aim (start spot), pull back then swipe up to bowl (speed = power, curl = hook) with pull feedback; Hold-to-roll power button kept; sliders fold behind "Fine-tune" on phones; blue aim guide. Camera: behind bowler → follows the ball → drops to pin level at impact → eases back to a wider deck view.
- **Golf:** drag to aim (sensitivity), clubs, **pull down and flick up** on Swing (straight = pure, drift = draw/fade) or the hold/release/tap meter; existing predicted path + landing ring and wind. Camera (existing, verified): behind the golfer, follows the flight, landing view, low putting camera.
- **Athletics:** Left / Action / Right layout (two thumbs alternate, action in the middle), the next pad glows, rhythm light (Great / Too fast / Faster); mashing is already penalised by the sim. Camera: side tracking, looks ahead in hurdles, frames the finish line at the end.
- **Racing:** steering wheel (default, drag), arrow buttons or tilt (gravity-based, re-centre/invert, iPhone permission prompt); hold Gas/Brake/Drift as separate touches (steer + throttle + drift together); camera views Chase / Close / Bonnet / Cockpit (C key or camera button); chase camera looks into corners, pulls back with speed, shows slide angle, gentle impact response; Steady mode removes speed effects.

### Controls guide (all games)
- Before every practice game starts, a "How to play" screen shows the goal and controls (Keyboard / Touch tabs, auto-picked by device); Enter/Space or the button starts the game.
- Online: the guide is shown in the match lobby and on the "waiting for opponent" screen; a ? button in every game opens it any time (it doesn't pause online play). The Help page has every sport's controls plus FAQs.

### Visual transformation — tennis benchmark (realistic athletes)
- Realistic human athletes (male/female) built from **MakeHuman CC0** body, skeleton and skin weights, dressed with generated kit (shirt, shorts, socks, lofted shoes), six hair styles, cap/headband/wristbands, eyes, brows and skin detail. Colours follow each player's avatar (skin, hair, kit, shoes, accessory; neutral picks a body from the nickname).
- Motion from the **CMU motion-capture database** (free for any use), retargeted offline onto the MakeHuman skeleton: ready stance, run, walk, forehand, one-handed backhand, serve (pitch upper body on grounded legs), cheer, dejection, two seated poses. Runtime mixer in `src/game/character/athlete.ts` blends clips per bone; tennis timing puts each stroke's contact frame on the simulation's contact time (`src/game/tennis/athlete-anim.ts`). Gameplay, physics, scoring and multiplayer are unchanged (animation reads the same state online and offline).
- Tennis venue: realistic crowd (24 athlete models baked once into a seated/cheering card atlas, ~1.5k fans in one draw call, cheering on points), seated umpire, crouching ball kids, line judges (high quality), deeper stands, concrete bowl, cantilevered roof with light strips, ball bounce marks (clay marks persist), clay dust, contact flash, proper racket frame/string bed.
- Settings → Graphics: Realistic (default) / Classic. Falls back to classic characters if the models fail to load.
- Asset pipeline (Node, no dependencies): `scripts/athlete/` (see its README); outputs `public/assets/athletes/` (~1.1 MB per body + 0.24 MB animations). Credits in `public/assets/athletes/CREDITS.txt`.
- Bowling (done): the player's bowler and the neighbouring-lane bowlers are realistic athletes. `src/game/character/mirror.ts` copies the existing procedural bowling animation from the hidden classic rig onto the athlete every frame (per-limb direction correction, athlete sized to the rig so cameras and the held ball line up); the ball sits in the athlete's palm. Galleries and the lounge use the realistic crowd.
- Next: golf, athletics, parkour (same mirror approach), racing (drivers/cars).

## In progress
- Bowling: planar lane reflections. Golf: green-reading grid, more terrain detail (rough grass blades), ambient sound.

## Outstanding tasks
- PNG app icons (192/512) for full Android installability → Milestone 10.
- Service worker, install prompt flow → Milestone 10.
- Settings toggles (sound/music/haptics) are saved but have nothing to control until gameplay exists.

## Known bugs
- None confirmed. Code was written outside Lovable without a local dependency install; Lovable's build is the typecheck. See Test results.

## Blockers / setup needed
- The Render game server does **not** redeploy automatically on push (the repo is connected by URL, without Render's GitHub app). After changing `server/realtime` or the shared game code, trigger a deploy on Render (dashboard "Manual Deploy" or the Render tool). Connecting the repo through Render's GitHub app would make it automatic.
- Supabase dashboard → Authentication → URL Configuration: set Site URL and add the preview URL to Redirect URLs (see docs/SUPABASE.md), otherwise confirmation/reset emails link to localhost.
- Custom SMTP before launch (default Supabase email is rate-limited).

## Database status
- **Connected.** Supabase project `piayiahsdcwvtocggyer`. Schema + RLS applied and tested. Guests still use device-local storage.

## Multiplayer status
- Lobby, presence and ready-check are live (Supabase Realtime).
- **Bowling (turn-based) is fully online and server-authoritative** via the `bowling-throw` edge function — no separate game server needed.
- **Golf (turn-based) is fully online and server-authoritative** via the `golf-shot` edge function.
- **Tennis is fully online** on the real-time game server (Render).
- **Racing is fully online** on the same server.
- **Athletics is fully online** on the same server (2 players + 4 AI lanes).
- **Parkour is fully online** on the same server (2 players + 2 computer runners).

## Test results
- Added `src/test/schemas.test.ts` (avatar schema, register/login schemas, XP curve) alongside the existing routing test.
- Added `src/test/auth-service.test.ts` (error mapping, new-password schema).
- Database security tests (SQL, rolled back): 10/10 passed after fixing a case-sensitivity bug in username checks.
- Supabase security advisor: only intentional findings (audit_logs has no client policies; username_available is public by design).
- Milestone 3 database tests (SQL, rolled back, 3 test players): 18/18 passed — duplicate requests, challenging non-friends, invalid formats, double invitations, accepting your own invite, outsiders viewing private matches or leaving others' lobbies, blocked players re-requesting, and forged notifications are all rejected.
- Bugs found and fixed during Milestone 3: infinite recursion between match and participant access policies; friendship deletes leaking through realtime (table removed from realtime).
- Bowling scoring: 17/17 checks passed (perfect 300, all spares 150, gutter game, tenth-frame bonuses, 3- and 5-frame games, invalid rolls, throw validation).
- Bowling server settlement test (SQL, rolled back): players can't call the scoring function or insert throws, replayed and out-of-turn throws rejected, winner/rating (+16/−16)/XP/coins/levels/stats/achievements/notifications correct.
- Live browser tests (Chrome, preview): practice game — 3D scene renders, throws simulate and score correctly (strike, spare, pin action), single throw per press (double-throw bug found and fixed). Online — throw simulated on the server (sim 112 ms; cold start ~4 s, warm ~1 s), turn passes to the opponent, opponent's throw replays live with banner and scoreboard update. Test opponent and match deleted afterwards.
- Golf physics checks (Node): club carries realistic, hook/slice curve correctly, head/tailwind change carry (215/262 m driver), rough/bunker reduce distance, putts holeable from 1.5–10 m when reading the break, 18-hole card = par 72, ~3 ms per shot.
- Golf scoring and match rules checks: par names, double-par pick-up, match play; away-player order, water penalty, honours, settlement — all passed.
- Live browser tests: bowler animation, crowd and glow render; golf course renders (all checks via screenshots), shots fly with tracer; online golf shot simulated on the server and the turn passed to the farther player. Bugs found and fixed: reversed golfer posture, flipped course map, swing accuracy read from a stale frame. Test players/matches deleted.
- Added `src/test/match-config.test.ts` (formats, error mapping, time helpers).
- Tennis: scoring tests + AI self-play on every surface (`src/test/tennis.test.ts`) — matches finish, average rally 5–8 shots, clay longest, grass shortest, mix of winners/outs/nets.
- Real-time server self-test (`server/realtime/selftest.ts`, mock database): foreign origins, bad tokens and non-participants rejected; seats by slot; 500 junk messages ignored; real points played over WebSockets; disconnect → forfeit settled once; winner told the result was saved — all passed.
- Live test against Render + Supabase (Chrome, preview): lowlog vs a temporary QA bot — server welcomed both, points played (aces, winners), scoreboard and umpire calls updated, the bot disconnected, after 30 s the server settled a forfeit win: match completed, verified_by `server:realtime`, rating +16/−16, `tennis_ace` granted. QA user, match and all stat changes removed afterwards.
- Racing: track and AI-field tests (`src/test/racing.test.ts`) — every circuit finishes, lap times 30–40 s, no impossible corners, malformed input rejected. Racing server self-test (`server/realtime/selftest-racing.ts`): two clients race a full lap over WebSockets, the faster driver is settled as the winner.
- Live racing test against Render + Supabase: lowlog vs a temporary QA bot on Neon City — countdown, driving at 115 km/h online, bot disconnected, forfeit win settled (rating +16/−16, `racing_podium`, stats). QA user, match and stat changes removed afterwards.
- Athletics: sim tests (`src/test/athletics.test.ts`); server self-test (`server/realtime/selftest-athletics.ts`): two clients run a 100m over WebSockets, the faster player wins and the result is saved.
- Live athletics test against Render + Supabase: lowlog connected, stadium and field rendered, the absent QA opponent forfeited and the server settled the result (rating +16/−16, XP, `athletics_gold`).
- Parkour: sim tests (`src/test/parkour.test.ts`: deterministic courses, every obstacle type, races finish, skill matters, nobody gets stuck, junk input ignored); server self-test (`server/realtime/selftest-parkour.ts`): two clients race over WebSockets, result settled once with times and places.
- Syntax check of all new files: passed.
- `vitest run`, `tsc` and `vite build`: **not yet run** (dependencies could not be installed in the authoring environment). Run in Lovable / CI to confirm.

## Deployment status
- Not published. Preview only: https://id-preview--b857ffc0-2276-46d4-aec2-187db99a0a1e.lovable.app

## Next milestone
- Live two-person tests of athletics and parkour online; replace the parkour card image with an in-game screenshot.

## Notes
- Routing uses TanStack Router (fixed by the Lovable TanStack Start template) instead of React Router; same page structure.
