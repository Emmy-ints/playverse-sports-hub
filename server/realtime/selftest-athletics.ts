// Athletics end-to-end self-test with a mock database: node --experimental-strip-types server/realtime/selftest-athletics.ts
import { startServer } from "./main.ts";
import { aiEvent } from "../../src/game/athletics/sim.ts";
const MATCH = "33333333-4444-5555-6666-777777777777";
const settled: unknown[][] = [];
const backend = {
  async userFromToken(t: string) { return t === "tokA" ? "user-a" : t === "tokB" ? "user-b" : null; },
  async matchInfo(id: string) { return id === MATCH ? { id, sport: "athletics", status: "in_progress", config: { mode: "sprint100", length: 1 }, players: [{ id: "user-a", slot: 0, name: "Ann", avatar: null }, { id: "user-b", slot: 1, name: "Bob", avatar: null }] } : null; },
  async settleTennis() {}, async settleRacing() {},
  async settleAthletics(...a: unknown[]) { settled.push(a); },
};
const { server } = startServer({ port: 18082, backend, allowedOrigins: ["lovable.app"] });
let ok = true; const check = (c: boolean, m: string) => { console.log(c ? "ok  " : "FAIL", m); if (!c) ok = false; };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const open = (token: string) => new Promise<{ ws: WebSocket; msgs: any[]; st: { s: any } }>((res, rej) => {
  const ws = new (WebSocket as any)("ws://127.0.0.1:18082/play", { headers: { Origin: "https://x.lovable.app" } }) as WebSocket;
  const msgs: any[] = []; const st = { s: null as any };
  ws.onmessage = (e) => { const m = JSON.parse(String(e.data)); if (m.t === "s") st.s = m.st; else msgs.push(m); };
  ws.onopen = () => { ws.send(JSON.stringify({ t: "join", match: MATCH, token })); res({ ws, msgs, st }); };
  ws.onerror = rej;
});
const A = await open("tokA"), B = await open("tokB");
await sleep(400);
check(A.msgs[0]?.t === "welcome" && A.msgs[0].sport === "athletics" && A.msgs[0].events[0] === "sprint100", "athletics welcome with event list");
let seq = 0; const t0 = Date.now();
while (Date.now() - t0 < 40000 && !A.msgs.some((m) => m.t === "end")) {
  for (const [i, X] of [A, B].entries()) {
    if (!X.st.s) continue;
    const e = aiEvent(X.st.s, i, i === 0 ? 0.97 : 0.2, ++seq);
    if (e) X.ws.send(JSON.stringify({ t: "in", ...e }));
  }
  await sleep(40);
}
const end = A.msgs.find((m) => m.t === "end");
check(!!end && end.saved && end.winner === 0, `race finished, faster player won and result saved (${JSON.stringify(end)})`);
check(settled.length === 1 && settled[0]![1] === "user-a" && typeof (settled[0]![2] as any).players["user-a"].sprint100 === "number", "settled with the player's 100m time");
A.ws.close(); B.ws.close(); server.close(); process.exit(ok ? 0 : 1);
