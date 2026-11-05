import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

/** Minimal RFC6455 server connection (text frames, ping/pong, close). Zero dependencies. */
class WsConn extends EventEmitter {
  constructor(socket, maxPayload) {
    super();
    this.socket = socket;
    this.max = maxPayload;
    this.buf = Buffer.alloc(0);
    this.alive = true;
    this.closed = false;
    socket.on('data', (d) => this.#onData(d));
    socket.on('close', () => this.#finish());
    socket.on('error', () => this.#finish());
  }
  #finish() { if (!this.closed) { this.closed = true; this.emit('close'); } }
  #onData(d) {
    this.buf = Buffer.concat([this.buf, d]);
    for (;;) {
      if (this.closed || this.buf.length < 2) return;
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = !!(b0 & 0x80), op = b0 & 0x0f, masked = !!(b1 & 0x80);
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; const big = this.buf.readBigUInt64BE(2); if (big > BigInt(this.max)) return this.close(1009); len = Number(big); off = 10; }
      if (len > this.max) return this.close(1009);
      if (!masked) return this.close(1002);
      if (this.buf.length < off + 4 + len) return;
      const mask = this.buf.subarray(off, off + 4);
      const payload = Buffer.from(this.buf.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      this.buf = this.buf.subarray(off + 4 + len);
      if (!fin || op === 0) return this.close(1003);
      if (op === 1) this.emit('message', payload.toString('utf8'));
      else if (op === 8) return this.close(1000);
      else if (op === 9) this.#frame(0xA, payload);
      else if (op === 10) this.alive = true;
      else return this.close(1003);
    }
  }
  #frame(op, payload) {
    if (this.closed || this.socket.destroyed) return;
    const n = payload.length;
    let head;
    if (n < 126) head = Buffer.from([0x80 | op, n]);
    else if (n < 65536) head = Buffer.from([0x80 | op, 126, n >> 8, n & 255]);
    else { head = Buffer.alloc(10); head[0] = 0x80 | op; head[1] = 127; head.writeBigUInt64BE(BigInt(n), 2); }
    this.socket.write(Buffer.concat([head, payload]));
  }
  send(obj) { this.#frame(1, Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))); }
  ping() { this.alive = false; this.#frame(9, Buffer.alloc(0)); }
  close(code = 1000) {
    if (this.closed) return;
    this.#frame(8, Buffer.from([code >> 8, code & 255]));
    this.socket.end();
    this.socket.destroy();
    this.#finish();
  }
}

export function attachWs(server, { path, maxPayload = 4096, heartbeatMs = 30_000, maxPerIp = 10, originOk = () => true, onConnection }) {
  const conns = new Set();
  const perIp = new Map();
  server.on('upgrade', (req, socket) => {
    const reject = (code, msg) => { socket.write(`HTTP/1.1 ${code} ${msg}\r\nConnection: close\r\n\r\n`); socket.destroy(); };
    const url = new URL(req.url, 'http://localhost');
    const key = req.headers['sec-websocket-key'];
    if (url.pathname !== path || String(req.headers.upgrade).toLowerCase() !== 'websocket' || !key || req.headers['sec-websocket-version'] !== '13') return reject(400, 'Bad Request');
    if (!originOk(req.headers.origin)) return reject(403, 'Forbidden');
    const ip = req.socket.remoteAddress;
    if ((perIp.get(ip) || 0) >= maxPerIp) return reject(429, 'Too Many Requests');
    const accept = createHash('sha1').update(key + GUID).digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const conn = new WsConn(socket, maxPayload);
    conns.add(conn);
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    conn.on('close', () => { conns.delete(conn); perIp.set(ip, Math.max(0, (perIp.get(ip) || 1) - 1)); });
    onConnection(conn, req);
  });
  const timer = setInterval(() => { for (const c of conns) { if (!c.alive) c.close(1001); else c.ping(); } }, heartbeatMs);
  timer.unref();
  return { conns, stop() { clearInterval(timer); for (const c of conns) c.close(1001); } };
}
