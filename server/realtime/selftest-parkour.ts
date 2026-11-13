// Parkour end-to-end self-test with a mock database: node --experimental-strip-types server/realtime/selftest-parkour.ts
import { startServer } from "./main.ts";
import { aiInput, createRace, type RaceState } from "../../src/game/parkour/sim.ts";
const MATCH = "44444444-5555-6666-7777-888888888888";
const settled: unknown[][] = [];
const backend = {
  async userFromToken(t: string) { return t === "tokA" ? "user-a" : t === "tokB" ? "user-b" : null; },
  async matchInfo(id: string) { return id === MATCH ? { id, sport: "parkour", status: "in_progress", config: { mode: "sprint", length: 1 }, players: [{ id: "user-a", slot: 0, name: "Ann", avatar: null }, { id: "user-b", slot: 1, name: "Bob", avatar: null }] } : null; },
  async settleTennis() {}, async settleRacing() {}, async settleAthletics() {},
  async settleParkour(...a: unknown[]) { settled.push(a); },
};
const { server } = startServer({ port: 18083, backend, allowedOrigins: ["lovable.app"] });
let ok = true; const check = (c: boolean, m: string) => { console.log(c ? "ok  " : "FAIL", m); if (!c) ok = false; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const open = (token: string) => new Promise<{ ws: WebSocket; msgs: any[]; st: { s: RaceState | null } }>((res, rej) => {
  const ws = new (WebSocket as any)("ws://127.0.0.1:18083/play", { headers: { Origin: "https://x.lovable.app" } }) as WebSocket;
  const msgs: any[] = []; const st = { s: null as RaceState | null };
  ws.onmessage = (e) => {
    const m = JSON.parse(String(e.data));
    if (m.t === "welcome") st.s = createRace(4, m.seed, m.length);
    if (m.t === "s") { if (st.s) Object.assign(st.s, m.st); } else msgs.push(m);
  };
  ws.onopen = () => { ws.send(JSON.stringify({ t: "join", match: MATCH, token })); res({ ws, msgs, st }); };
  ws.onerror = rej;
});
const A = await open("tokA"), B = await open("tokB");
await sleep(400);
const w = A.msgs[0];
check(w?.t === "welcome" && w.sport === "parkour" && w.length === 220 && typeof w.seed === "number", "parkour welcome with course seed and length");
// Snapshots are small (no course inside).
check(JSON.stringify(createRace(4, 1)).length > 2 * JSON.stringify({ runners: A.st.s?.runners }).length, "snapshot leaves the course out");
// Junk input is ignored.
A.ws.send(JSON.stringify({ t: "in", key: "X", seq: 1, down: true }));
A.ws.send("not json");
let seq = 0; const t0 = Date.now();
while (Date.now() - t0 < 60000 && !A.msgs.some((m) => m.t === "end")) {
  for (const [i, X] of [A, B].entries()) {
    if (!X.st.s) continue;
    const e = aiInput(X.st.s, i, i === 0 ? 0.97 : 0.15, ++seq);
    if (e) X.ws.send(JSON.stringify({ t: "in", ...e }));
  }
  await sleep(30);
}
const end = A.msgs.find((m) => m.t === "end");
check(!!end && end.saved, `race finished and result saved (${JSON.stringify(end)})`);
check(settled.length === 1, "settled exactly once");
const res = settled[0]?.[2] as any;
check(!!res && typeof res.players["user-a"].time === "number" && res.players["user-a"].place >= 1, "settlement has each player's time and place");
check(settled[0]?.[1] === (end.winner === 0 ? "user-a" : "user-b"), "winner in the database matches the race");
A.ws.close(); B.ws.close(); server.close(); process.exit(ok ? 0 : 1);
