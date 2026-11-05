import type { RiderEvent } from './types';
export type Status = 'connecting' | 'open' | 'closed';
interface RiderLocation { latitude: number; longitude: number }
interface Opts {
  url: string; getToken: () => string | null; onEvent: (e: RiderEvent) => void; onStatus?: (s: Status) => void; onReconnect?: () => void;
  WS?: typeof WebSocket; maxBackoffMs?: number; pingMs?: number;
}
/** Auto-reconnecting channel for new/taken/assigned order events (backoff + jitter, heartbeat, re-auth). */
export class RiderRealtime {
  private ws: WebSocket | null = null; private attempt = 0; private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null; private stopped = true; private hadOpen = false;
  private authenticated = false;
  private location: { orderId: string; coords: RiderLocation } | null = null;
  constructor(private o: Opts) {}
  start() { if (!this.stopped) return; this.stopped = false; this.open(); }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    this.timer = this.ping = null; this.authenticated = false; this.location = null;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null; this.o.onStatus?.('closed');
  }
  authenticate() { const t = this.o.getToken(); this.authenticated = false; if (t && this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'auth', token: t })); }
  publishLocation(orderId: string, coords: RiderLocation) {
    if (this.location && this.location.orderId !== orderId && this.authenticated) {
      this.ws?.send(JSON.stringify({ type: 'rider_location', orderId: this.location.orderId, location: null }));
    }
    this.location = { orderId, coords };
    if (this.authenticated) this.sendLocation();
  }
  clearLocation(orderId: string) {
    if (this.location?.orderId !== orderId) return;
    this.location = null;
    if (this.authenticated) this.ws?.send(JSON.stringify({ type: 'rider_location', orderId, location: null }));
  }
  private sendLocation() {
    if (this.location && this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type: 'rider_location', orderId: this.location.orderId, location: this.location.coords }));
  }
  private open() {
    const WSImpl = this.o.WS ?? WebSocket;
    this.o.onStatus?.('connecting');
    const ws = new WSImpl(this.o.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0; this.o.onStatus?.('open');
      if (this.hadOpen) this.o.onReconnect?.();
      this.hadOpen = true; this.authenticated = false; this.authenticate();
      this.ping = setInterval(() => { try { ws.send('{"type":"ping"}'); } catch { /* closing */ } }, this.o.pingMs ?? 25_000);
    };
    ws.onmessage = (e: any) => {
      let m: any; try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type === 'ready' && m.authed) { this.authenticated = true; this.sendLocation(); }
      else if (m.type === 'order_available' || m.type === 'order_taken' || m.type === 'order_assigned') this.o.onEvent(m);
    };
    ws.onclose = () => {
      if (this.ping) clearInterval(this.ping); this.ping = null;
      this.authenticated = false;
      if (this.stopped || this.ws !== ws) return;
      this.o.onStatus?.('closed');
      const base = Math.min(this.o.maxBackoffMs ?? 30_000, 1000 * 2 ** this.attempt++);
      this.timer = setTimeout(() => { if (!this.stopped) this.open(); }, base / 2 + Math.random() * (base / 2));
    };
    ws.onerror = () => { /* onclose follows */ };
  }
}
