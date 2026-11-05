import type { AppNotification, Product } from './types';

export type Status = 'connecting' | 'open' | 'closed';
export interface TrackingLocation { latitude: number; longitude: number; updatedAt: number }
interface Opts {
  url: string;
  getToken: () => string | null;
  onPrices: (items: Product[]) => void;
  onNotification: (n: AppNotification) => void;
  onStatus?: (s: Status) => void;
  onReconnect?: () => void; // lets the app re-sync prices after a gap
  WS?: typeof WebSocket;
  maxBackoffMs?: number;
  pingMs?: number;
}

/** Auto-reconnecting realtime channel (exponential backoff + jitter, heartbeat, token re-auth). */
export class Realtime {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private stopped = true;
  private hadOpen = false;
  private authenticated = false;
  private trackingOrderId: string | null = null;
  private trackingListener: ((location: TrackingLocation | null) => void) | null = null;
  private trackingStatusListener: ((status: string) => void) | null = null;
  constructor(private o: Opts) {}

  start() { if (!this.stopped) return; this.stopped = false; this.open(); }
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ping) clearInterval(this.ping);
    this.timer = this.ping = null;
    this.authenticated = false;
    this.trackingOrderId = null;
    this.trackingListener = null;
    this.trackingStatusListener = null;
    try { this.ws?.close(); } catch { /* noop */ }
    this.ws = null;
    this.o.onStatus?.('closed');
  }
  /** Call after login / token refresh so notifications for this user start flowing. */
  authenticate() {
    const t = this.o.getToken();
    this.authenticated = false;
    if (t && this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify({ type: 'auth', token: t }));
  }
  subscribeOrder(orderId: string, onLocation: (location: TrackingLocation | null) => void, onStatus?: (status: string) => void) {
    if (this.trackingOrderId && this.trackingOrderId !== orderId) this.send({ type: 'tracking_unsubscribe', orderId: this.trackingOrderId });
    this.trackingOrderId = orderId;
    this.trackingListener = onLocation;
    this.trackingStatusListener = onStatus ?? null;
    if (this.authenticated) this.send({ type: 'tracking_subscribe', orderId });
  }
  unsubscribeOrder(orderId: string) {
    if (this.trackingOrderId !== orderId) return;
    this.send({ type: 'tracking_unsubscribe', orderId });
    this.trackingOrderId = null;
    this.trackingListener = null;
    this.trackingStatusListener = null;
  }
  private send(message: object) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(message));
  }
  private open() {
    const WSImpl = this.o.WS ?? WebSocket;
    this.o.onStatus?.('connecting');
    const ws = new WSImpl(this.o.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.o.onStatus?.('open');
      if (this.hadOpen) this.o.onReconnect?.();
      this.hadOpen = true;
      this.authenticated = false;
      this.authenticate();
      this.ping = setInterval(() => { try { ws.send('{"type":"ping"}'); } catch { /* closing */ } }, this.o.pingMs ?? 25_000);
    };
    ws.onmessage = (e: any) => {
      let m: any;
      try { m = JSON.parse(String(e.data)); } catch { return; }
      if (m.type === 'prices' && Array.isArray(m.items)) this.o.onPrices(m.items);
      else if (m.type === 'notification' && m.notification) this.o.onNotification(m.notification);
      else if (m.type === 'ready' && m.authed) {
        this.authenticated = true;
        if (this.trackingOrderId) this.send({ type: 'tracking_subscribe', orderId: this.trackingOrderId });
      } else if (m.type === 'tracking_location' && m.orderId === this.trackingOrderId) {
        this.trackingListener?.(m.location ?? null);
      } else if (m.type === 'tracking_status' && m.orderId === this.trackingOrderId) {
        this.trackingStatusListener?.(m.status);
      }
    };
    ws.onclose = () => {
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      this.authenticated = false;
      if (this.stopped || this.ws !== ws) return;
      this.o.onStatus?.('closed');
      const base = Math.min(this.o.maxBackoffMs ?? 30_000, 1000 * 2 ** this.attempt++);
      this.timer = setTimeout(() => { if (!this.stopped) this.open(); }, base / 2 + Math.random() * (base / 2));
    };
    ws.onerror = () => { /* onclose follows */ };
  }
}
