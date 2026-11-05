import type { Address, AppNotification, AuthResponse, CartLine, LedgerEntry, Order, Product, Quote, Tokens, User, WalletRules, WalletSummary } from './types';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: any, public retryAfter?: number) { super(message); }
  get isNetwork() { return this.status === 0; }
}
export interface TokenStore { load(): Promise<Tokens | null>; save(t: Tokens | null): Promise<void> }
interface Opts { baseUrl: string; store: TokenStore; fetchImpl?: typeof fetch; onAuthLost?: () => void; timeoutMs?: number; client?: string }
interface Req { body?: unknown; auth?: boolean; headers?: Record<string, string> }

export class ApiClient {
  private tokens: Tokens | null = null;
  private loaded = false;
  private refreshing: Promise<void> | null = null;
  private productsCache: { etag: string; data: { items: Product[]; categories: string[] } } | null = null;
  readonly client: string;
  constructor(private o: Opts) { this.client = o.client ?? 'customer_app'; }

  private async ensureTokens() { if (!this.loaded) { this.tokens = await this.o.store.load(); this.loaded = true; } return this.tokens; }
  async setTokens(t: Tokens | null) {
    if (t === null) {
      this.tokens = null;
      this.loaded = true;
      await this.o.store.save(null);
      return;
    }
    await this.o.store.save(t);
    this.tokens = t;
    this.loaded = true;
  }
  async hasSession() { return !!(await this.ensureTokens()); }
  get accessToken() { return this.tokens?.accessToken ?? null; }

  private async once(method: string, path: string, { body, auth = true, headers = {} }: Req) {
    const f = this.o.fetchImpl ?? fetch;
    const h: Record<string, string> = { accept: 'application/json', ...headers };
    if (body !== undefined) h['content-type'] = 'application/json';
    if (auth && this.tokens) h.authorization = `Bearer ${this.tokens.accessToken}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.o.timeoutMs ?? 12_000);
    try {
      return await f(this.o.baseUrl + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), signal: ctrl.signal });
    } catch (e: any) {
      throw new ApiError(0, e?.name === 'AbortError' ? 'timeout' : 'network', e?.name === 'AbortError' ? 'The request timed out. Check that the backend is running and try again.' : 'Could not reach the YoGreen backend. Check that it is running and that the app API URL is correct.');
    } finally { clearTimeout(timer); }
  }

  private async refreshOnce() {
    if (!this.refreshing) {
      this.refreshing = (async () => {
        const rt = this.tokens?.refreshToken;
        if (!rt) throw new ApiError(401, 'unauthorized', 'Session expired');
        const res = await this.once('POST', '/v1/auth/refresh', { auth: false, body: { refreshToken: rt } });
        if (!res.ok) { await this.setTokens(null); this.o.onAuthLost?.(); throw new ApiError(401, 'session_expired', 'Your session expired. Please log in again.'); }
        const j = await res.json();
        await this.setTokens({ accessToken: j.accessToken, refreshToken: j.refreshToken });
      })().finally(() => { this.refreshing = null; });
    }
    return this.refreshing;
  }

  async request<T = any>(method: string, path: string, req: Req = {}): Promise<{ status: number; data: T; headers: Headers }> {
    await this.ensureTokens();
    const doOnce = async () => {
      try { return await this.once(method, path, req); }
      catch (e) { if (method === 'GET' && e instanceof ApiError && e.isNetwork) { await new Promise((r) => setTimeout(r, 400)); return this.once(method, path, req); } throw e; }
    };
    const usedToken = this.tokens?.accessToken;
    let res = await doOnce();
    if (res.status === 401 && req.auth !== false && this.tokens) {
      // If another in-flight request already rotated the tokens, just retry with the new ones (no second rotation).
      if (this.tokens?.accessToken === usedToken) await this.refreshOnce();
      if (!this.tokens) throw new ApiError(401, 'session_expired', 'Your session expired. Please log in again.');
      res = await doOnce();
    }
    if (res.status === 304) return { status: 304, data: undefined as T, headers: res.headers };
    const text = await res.text();
    const json = text ? safeJson(text) : null;
    if (!res.ok) {
      const e = json?.error;
      throw new ApiError(res.status, e?.code ?? 'error', e?.message ?? 'Something went wrong', e?.details, Number(res.headers.get('retry-after')) || e?.details?.retryAfter);
    }
    return { status: res.status, data: json as T, headers: res.headers };
  }
  private get = <T>(p: string) => this.request<T>('GET', p).then((r) => r.data);
  private send = <T>(m: string, p: string, body?: unknown, headers?: Record<string, string>) => this.request<T>(m, p, { body: body ?? {}, headers }).then((r) => r.data);

  // ---- auth
  sendOtp(phone10: string, mode?: 'login' | 'signup') { return this.request<{ resendIn: number; expiresIn: number; devOtp?: string }>('POST', '/v1/auth/otp/send', { auth: false, body: { phone: phone10, client: this.client, ...(mode ? { mode } : {}) } }).then((r) => r.data); }
  async verifyOtp(phone10: string, otp: string, deviceId?: string, mode?: 'login' | 'signup') {
    const r = await this.request<AuthResponse>('POST', '/v1/auth/otp/verify', { auth: false, body: { phone: phone10, otp, client: this.client, deviceId, ...(mode ? { mode } : {}) } });
    if (!('pendingApproval' in r.data)) {
      if (!r.data.accessToken || !r.data.refreshToken) throw new ApiError(500, 'invalid_auth_response', 'The backend returned an incomplete sign-in response.');
      await this.setTokens({ accessToken: r.data.accessToken, refreshToken: r.data.refreshToken });
    }
    return r.data;
  }
  async logout() { try { await this.request('POST', '/v1/auth/logout', { body: {} }); } catch { /* local sign-out proceeds regardless */ } await this.setTokens(null); }

  // ---- profile
  me() { return this.get<{ user: User; addresses: Address[]; wallet: WalletSummary }>('/v1/me'); }
  patchMe(b: { name?: string; email?: string; prefs?: { pushEnabled?: boolean; language?: string } }) { return this.send<{ user: User }>('PATCH', '/v1/me', b); }
  completeSetup(b: { name: string; email?: string; address: Omit<Address, 'id'>; prefs: { pushEnabled: boolean } }) { return this.send<{ user: User; addresses: Address[]; wallet: WalletSummary; bonusGranted: number }>('PUT', '/v1/me/setup', b); }
  addAddress(a: Omit<Address, 'id'>) { return this.send<Address>('POST', '/v1/me/addresses', a); }
  deleteAddress(id: string) { return this.send('DELETE', `/v1/me/addresses/${id}`); }
  registerDevice(token: string, platform: 'ios' | 'android') { return this.send('POST', '/v1/me/devices', { token, platform }); }
  async deleteAccount() { await this.send('DELETE', '/v1/me'); await this.setTokens(null); }

  // ---- catalog (ETag revalidation => 304 and zero parsing when nothing changed)
  async products() {
    const r = await this.request<{ items: Product[]; categories: string[] }>('GET', '/v1/products', { auth: false, headers: this.productsCache ? { 'if-none-match': this.productsCache.etag } : {} });
    if (r.status === 304 && this.productsCache) return this.productsCache.data;
    const etag = r.headers.get('etag');
    if (etag) this.productsCache = { etag, data: r.data };
    return r.data;
  }

  // ---- orders
  cart() { return this.get<{ items: CartLine[] }>('/v1/cart'); }
  updateCart(items: CartLine[]) { return this.send<{ items: CartLine[] }>('PUT', '/v1/cart', { items }); }
  quote(items: CartLine[], useCoins = 0) { return this.send<Quote>('POST', '/v1/cart/quote', { items, useCoins }); }
  placeOrder(b: { items: CartLine[]; addressId: string; useCoins: number; note?: string }, idempotencyKey: string) { return this.send<{ order: Order; wallet: WalletSummary }>('POST', '/v1/orders', b, { 'idempotency-key': idempotencyKey }); }
  orders() { return this.get<{ items: Order[] }>('/v1/orders'); }
  order(id: string) { return this.get<{ order: Order }>(`/v1/orders/${id}`); }
  cancelOrder(id: string) { return this.send<{ order: Order; wallet: WalletSummary }>('POST', `/v1/orders/${id}/cancel`); }

  // ---- wallet / notifications
  wallet() { return this.get<WalletSummary & { rules: WalletRules }>('/v1/wallet'); }
  walletHistory(before?: number) { return this.get<{ items: LedgerEntry[]; nextBefore: number | null }>(`/v1/wallet/history?limit=20${before ? `&before=${before}` : ''}`); }
  checkin() { return this.send<{ earned: number; streak: number; balance: number }>('POST', '/v1/wallet/checkin'); }
  notifications() { return this.get<{ items: AppNotification[]; unread: number }>('/v1/notifications'); }
  markNotificationsRead() { return this.send('POST', '/v1/notifications/read'); }
}
function safeJson(t: string) { try { return JSON.parse(t); } catch { return null; } }
