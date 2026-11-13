/**
 * Minimal, dependency-free WebSocket server (RFC 6455) on top of node:http — text frames,
 * ping/pong, close, fragmentation, payload limits. Small enough to audit; no npm install needed.
 */
import { createHash } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_PAYLOAD = 16 * 1024;

export class Socket {
  private buf = Buffer.alloc(0);
  private frag: Buffer[] = [];
  closed = false;
  onMessage: (text: string) => void = () => {};
  onClose: () => void = () => {};
  private pingTimer: ReturnType<typeof setInterval>;
  private alive = true;

  private sock: Duplex;
  readonly ip: string;

  constructor(sock: Duplex, ip: string) {
    this.sock = sock;
    this.ip = ip;
    sock.on("data", (d: Buffer) => this.feed(d));
    sock.on("close", () => this.finish());
    sock.on("error", () => this.finish());
    sock.on("end", () => this.finish());
    // Heartbeat: drop connections that stop answering pings (phones going to sleep, dead Wi-Fi).
    this.pingTimer = setInterval(() => {
      if (!this.alive) return this.terminate();
      this.alive = false;
      this.frame(0x9, Buffer.alloc(0));
    }, 15000);
  }

  send(text: string) {
    if (this.closed) return;
    this.frame(0x1, Buffer.from(text, "utf8"));
  }

  close(code = 1000, reason = "") {
    if (this.closed) return;
    const r = Buffer.from(reason.slice(0, 100), "utf8");
    const p = Buffer.alloc(2 + r.length);
    p.writeUInt16BE(code, 0);
    r.copy(p, 2);
    this.frame(0x8, p);
    this.sock.end();
    this.finish();
  }

  terminate() {
    this.sock.destroy();
    this.finish();
  }

  private finish() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.pingTimer);
    this.onClose();
  }

  private frame(op: number, payload: Buffer) {
    if (this.sock.destroyed) return;
    const len = payload.length;
    let head: Buffer;
    if (len < 126) {
      head = Buffer.from([0x80 | op, len]);
    } else if (len < 65536) {
      head = Buffer.alloc(4);
      head[0] = 0x80 | op;
      head[1] = 126;
      head.writeUInt16BE(len, 2);
    } else {
      head = Buffer.alloc(10);
      head[0] = 0x80 | op;
      head[1] = 127;
      head.writeBigUInt64BE(BigInt(len), 2);
    }
    this.sock.write(Buffer.concat([head, payload]));
  }

  private feed(d: Buffer) {
    this.buf = Buffer.concat([this.buf, d]);
    if (this.buf.length > MAX_PAYLOAD * 4) return this.close(1009, "too big");
    for (;;) {
      if (this.buf.length < 2) return;
      const b0 = this.buf[0]!, b1 = this.buf[1]!;
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let off = 2;
      if (len === 126) {
        if (this.buf.length < 4) return;
        len = this.buf.readUInt16BE(2);
        off = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) return;
        const big = this.buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_PAYLOAD)) return this.close(1009, "too big");
        len = Number(big);
        off = 10;
      }
      if (!masked) return this.close(1002, "unmasked");
      if (len > MAX_PAYLOAD) return this.close(1009, "too big");
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] = payload[i]! ^ mask[i & 3]!;
      this.buf = this.buf.subarray(off + 4 + len);
      this.alive = true;
      if (op === 0x8) return this.close();
      if (op === 0x9) { this.frame(0xa, payload); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0 || op === 0x2) {
        this.frag.push(payload);
        const total = this.frag.reduce((n, b) => n + b.length, 0);
        if (total > MAX_PAYLOAD) return this.close(1009, "too big");
        if (fin) {
          const msg = Buffer.concat(this.frag).toString("utf8");
          this.frag = [];
          try {
            this.onMessage(msg);
          } catch (e) {
            console.error("[ws] handler error", e);
          }
        }
        continue;
      }
      return this.close(1003, "unsupported");
    }
  }
}

/** Complete the WebSocket handshake for an HTTP upgrade request. Returns null if rejected. */
export function accept(req: IncomingMessage, sock: Duplex, allowOrigin: (origin: string | undefined) => boolean): Socket | null {
  const key = req.headers["sec-websocket-key"];
  if (typeof key !== "string" || req.headers.upgrade?.toLowerCase() !== "websocket" || !allowOrigin(req.headers.origin)) {
    sock.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    sock.destroy();
    return null;
  }
  const acceptKey = createHash("sha1").update(key + GUID).digest("base64");
  sock.write(["HTTP/1.1 101 Switching Protocols", "Upgrade: websocket", "Connection: Upgrade", `Sec-WebSocket-Accept: ${acceptKey}`, "", ""].join("\r\n"));
  const fwd = req.headers["x-forwarded-for"];
  const ip = (typeof fwd === "string" ? fwd.split(",")[0]!.trim() : req.socket.remoteAddress) ?? "?";
  return new Socket(sock, ip);
}
