// Racing end-to-end self-test with a mock database: node --experimental-strip-types server/realtime/selftest-racing.ts
import { startServer } from "./main.ts";
import { ROOM_TIMING } from "./tennis-room.ts";
import { applyRaceSnapshot } from "../../src/game/racing/net.ts";
import { aiDrive, createRace, type RaceState } from "../../src/game/racing/sim.ts";
ROOM_TIMING.reconnectGrace = 2;
const MATCH = "22222222-3333-4444-5555-666666666666";
const settled: unknown[][] = [];
const backend = {
  async userFromToken(t: string) { return t === "tokA" ? "user-a" : t === "tokB" ? "user-b" : t === "tokC" ? "user-c" : t === "tokD" ? "user-d" : null; },
  async canSpectate(t: string) { return t === "tokC"; },
  async matchInfo(id: string) { return id === MATCH ? { id, sport: "racing", status: "in_progress", config: { mode: "race", length: 1 }, players: [{ id: "user-a", slot: 1, name: "Ann", avatar: null }, { id: "user-b", slot: 2, name: "Bob", avatar: null }] } : null; },
  async settleTennis() {},
  async settleRacing(...a: unknown[]) { settled.push(a); },
};
const { server } = startServer({ port: 18081, backend, allowedOrigins: ["lovable.app"] });
let ok = true; const check = (c: boolean, m: string) => { console.log(c ? "ok  " : "FAIL", m); if (!c) ok = false; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const open = (token: string, spectate = false) => new Promise<{ ws: WebSocket; msgs: any[]; mirror: { s: RaceState | null } }>((res, rej) => {
  const ws = new (WebSocket as any)("ws://127.0.0.1:18081/play", { headers: { Origin: "https://x.lovable.app" } }) as WebSocket;
  const msgs: any[] = []; const mirror = { s: null as RaceState | null };
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); msgs.push(m); if (m.t === "welcome") mirror.s = createRace(m.track, 2, m.laps); if (m.t === "s" && mirror.s) applyRaceSnapshot(mirror.s, m.st); };
  ws.onopen = () => { ws.send(JSON.stringify({ t: "join", match: MATCH, token, ...(spectate ? { spectate: true } : {}) })); res({ ws, msgs, mirror }); };
  ws.onerror = rej;
});
const A = await open("tokA"), B = await open("tokB");
await sleep(400);
check(A.msgs[0]?.t === "welcome" && A.msgs[0].sport === "racing" && B.msgs[0]?.you === 1, "racing welcome with seats");
const C = await open("tokC", true), D = await open("tokD", true);
await sleep(400);
check(C.msgs[0]?.t === "welcome" && C.msgs[0].spectator === true && C.msgs.some((m) => m.t === "s"), "friend can spectate (welcome + snapshots)");
check(D.msgs.some((m) => m.t === "err" && m.code === "CANNOT_WATCH"), "non-friend cannot spectate");
C.ws.send(JSON.stringify({ t: "in", seq: 999, steer: 1, throttle: 0, brake: 1, handbrake: true }));
let seq = 0; const t0 = Date.now();
while (Date.now() - t0 < 75000 && !A.msgs.some((m) => m.t === "end")) {
  seq++;
  for (const [i, X] of [A, B].entries()) if (X.mirror.s) X.ws.send(JSON.stringify({ t: "in", ...aiDrive(X.mirror.s, i, i === 0 ? 0.95 : 0.6, seq) }));
  await sleep(33);
}
const end = A.msgs.find((m) => m.t === "end");
check(!!end && end.order.length === 2 && end.saved, `race finished and saved (${end ? `order ${end.order}, times ${end.times.map((t: number | null) => t?.toFixed(1))}` : "no end"})`);
check(C.msgs.some((m) => m.t === "end"), "spectator receives the result");
check(settled.length === 1 && settled[0]![1] === "user-a" && (settled[0]![2] as any).results["user-a"].position === 1, "faster driver settled as winner");
A.ws.close(); B.ws.close(); server.close(); process.exit(ok ? 0 : 1);
