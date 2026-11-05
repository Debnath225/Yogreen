import { ApiClient, type TokenStore } from './baseApi';
import type { AuthResult, EarningEntry, RiderSummary, RiderUser, Task } from './types';

type Scope = 'available' | 'active' | 'done';
/** Rider-specific endpoints on top of the shared token-refreshing client (client = rider_app). */
export class RiderApi extends ApiClient {
  constructor(o: { baseUrl: string; store: TokenStore; fetchImpl?: typeof fetch; onAuthLost?: () => void; timeoutMs?: number }) { super({ ...o, client: 'rider_app' }); }
  private async call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await this.request<T>(method, path, { body: method === 'GET' ? undefined : body ?? {} })).data;
  }
  me() { return this.call<{ rider: RiderUser } & RiderSummary>('GET', '/v1/rider/me'); }
  setOnline(online: boolean) { return this.call<RiderSummary>('POST', '/v1/rider/status', { online }); }
  tasks(scope: Scope) { return this.call<{ items: Task[]; online: boolean }>('GET', `/v1/rider/orders?scope=${scope}`); }
  task(id: string) { return this.call<{ order: Task }>('GET', `/v1/rider/orders/${id}`); }
  claim(id: string) { return this.call<{ order: Task }>('POST', `/v1/rider/orders/${id}/claim`); }
  release(id: string) { return this.call<{ order: Task }>('POST', `/v1/rider/orders/${id}/release`); }
  pickup(id: string) { return this.call<{ order: Task }>('POST', `/v1/rider/orders/${id}/pickup`); }
  deliver(id: string, code: string) { return this.call<{ order: Task } & RiderSummary>('POST', `/v1/rider/orders/${id}/deliver`, { code }); }
  earnings() { return this.call<RiderSummary & { items: EarningEntry[] }>('GET', '/v1/rider/earnings'); }
  rename(name: string) { return this.call<{ rider: RiderUser }>('PATCH', '/v1/rider/profile', { name }); }
  registerPush(token: string, platform: 'ios' | 'android') { return this.call('POST', '/v1/me/devices', { token, platform }); }
}
export type { AuthResult };
