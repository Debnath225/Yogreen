/** Fixed-window limiter. Swap for a Redis INCR+EXPIRE implementation when running more than one instance. */
export class RateLimiter {
  constructor() {
    this.hits = new Map();
    this.timer = setInterval(() => this.prune(), 60_000);
    this.timer.unref();
  }
  hit(key, limit, windowMs) {
    const now = Date.now();
    let e = this.hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; this.hits.set(key, e); }
    e.count++;
    return { ok: e.count <= limit, remaining: Math.max(0, limit - e.count), retryAfter: Math.ceil((e.reset - now) / 1000) };
  }
  prune() {
    const now = Date.now();
    for (const [k, e] of this.hits) if (e.reset <= now) this.hits.delete(k);
  }
  stop() { clearInterval(this.timer); }
}
