// End-to-end self-test with a mock database: node --experimental-strip-types server/realtime/selftest.ts
import { startServer } from "./main.ts";
import { ROOM_TIMING } from "./tennis-room.ts";
import { applySnapshot, mirrorState, extrapolate } from "../../src/game/tennis/net.ts";
import { aiInput } from "../../src/game/tennis/sim.ts";
ROOM_TIMING.startDelay = 0.5; ROOM_TIMING.reconnectGrace = 2;
const MATCH = "11111111-2222-3333-4444-555555555555";
const settled: unknown[] = [];
const backend = {
  async userFromToken(t: string) { return t === "tokA" ? "user-a" : t === "tokB" ? "user-b" : t === "tokC" ? "user-c" : null; },
  async matchInfo(id: string) { return id === MATCH ? { id, sport: "tennis", status: "in_progress", config: { mode: "quick", length: 1 }, players: [{ id: "user-a", slot: 1, name: "Ann", avatar: null }, { id: "user-b", slot: 2, name: "Bob", avatar: null }] } : null; },
  async settleTennis(...a: unknown[]) { settled.push(a); },
};
const { server } = startServer({ port: 18080, backend, allowedOrigins: ["lovable.app"] });
const open = (token: string, origin = "https://x.lovable.app") => new Promise<{ ws: WebSocket; msgs: any[] }>((res, rej) => {
  const ws = new (WebSocket as any)("ws://127.0.0.1:18080/play", { headers: { Origin: origin } }) as WebSocket;
  const msgs: any[] = [];
  ws.onmessage = (e) => msgs.push(JSON.parse(String(e.data)));
  ws.onopen = () => { ws.send(JSON.stringify({ t: "join", match: MATCH, token })); res({ ws, msgs }); };
  ws.onerror = (e) => rej(e);
});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let ok = true; const check = (c: boolean, m: string) => { console.log(c ? "ok  " : "FAIL", m); if (!c) ok = false; };

// Bad origin rejected.
const bad = await open("tokA", "https://evil.example").then(() => false, () => true);
check(bad, "rejects foreign origin");
// Unauthorized / not in match.
const u = await open("nope"); await sleep(300); check(u.msgs.some((m) => m.code === "UNAUTHORIZED"), "rejects bad token");
const c = await open("tokC"); await sleep(300); check(c.msgs.some((m) => m.code === "NOT_IN_MATCH"), "rejects non-participant");

const A = await open("tokA"); const B = await open("tokB");
await sleep(300);
check(A.msgs[0]?.t === "welcome" && A.msgs[0].you === 0 && B.msgs[0]?.you === 1, "seats assigned by slot");
const mir = [mirrorState({ bestOf: 1, gamesPerSet: 4 }), mirrorState({ bestOf: 1, gamesPerSet: 4 })];
let seq = 0; const t0 = Date.now(); let points = 0, hits = 0;
for (const [i, X] of [A, B].entries()) X.ws.addEventListener("message", (e: any) => { const m = JSON.parse(String(e.data)); if (m.t === "s") applySnapshot(mir[i]!, m.st); if (m.t === "ev" && i === 0) for (const ev of m.e) { if (ev.kind === "point") { points++; console.log("  point", ev.detail, "after", hits, "hits"); } if (ev.kind === "hit") hits++; } });
// Spam guard: 500 messages at once must not crash anything.
for (let k = 0; k < 500; k++) A.ws.send("{garbage");
while (Date.now() - t0 < 40000 && points < 6) {
  seq++;
  for (const [i, X] of [A, B].entries()) { const inp = aiInput(mir[i]!, i as 0 | 1, 0.5, seq); X.ws.send(JSON.stringify({ t: "in", ...inp })); }
  await sleep(33);
}
check(points >= 1 && hits >= 4, `online play produces real points (points ${points}, hits ${hits})`);
// Disconnect B → forfeit after grace.
B.ws.close();
await sleep(3500);
check(settled.length === 1 && (settled[0] as any[])[1] === "user-a" && (settled[0] as any[])[4] === true, "disconnect → forfeit settled for the opponent");
check(A.msgs.some((m) => m.t === "end" && m.winner === 0 && m.saved), "winner told the result was saved");
A.ws.close(); server.close(); process.exit(ok ? 0 : 1);
