import { EventEmitter } from 'node:events';
/** In-process pub/sub. For multi-instance deploys, replace with Redis pub/sub exposing the same publish/subscribe API. */
export class Bus {
  constructor() { this.ee = new EventEmitter(); this.ee.setMaxListeners(0); }
  publish(topic, msg) { this.ee.emit(topic, msg); }
  subscribe(topic, fn) { this.ee.on(topic, fn); return () => this.ee.off(topic, fn); }
}
