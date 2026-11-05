import type { AuthResponse, RiderApplication, Tokens } from './types';

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
  readonly client: string;
  constructor(protected o: Opts) { this.client = o.client ?? 'customer_app'; }

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
      throw new ApiError(0, e?.name === 'AbortError' ? 'timeout' : 'network', e?.name === 'AbortError' ? 'The request timed out. Please try again.' : 'Could not reach the YoGreen server. Check that the backend is running and its API URL is reachable from this device.');
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

  // ---- auth
  sendOtp(phone10: string, mode?: 'login' | 'signup') { return this.request<{ resendIn: number; expiresIn: number; devOtp?: string }>('POST', '/v1/auth/otp/send', { auth: false, body: { phone: phone10, client: this.client, ...(mode ? { mode } : {}) } }).then((r) => r.data); }
  async verifyOtp(phone10: string, otp: string, deviceId?: string, mode?: 'login' | 'signup', application?: RiderApplication) {
    const r = await this.request<AuthResponse>('POST', '/v1/auth/otp/verify', { auth: false, body: { phone: phone10, otp, client: this.client, deviceId, ...(mode ? { mode } : {}), ...(application ? { application } : {}) } });
    if (!('pendingApproval' in r.data)) {
      if (!r.data.accessToken || !r.data.refreshToken) throw new ApiError(500, 'invalid_auth_response', 'The backend returned an incomplete sign-in response.');
      await this.setTokens({ accessToken: r.data.accessToken, refreshToken: r.data.refreshToken });
    }
    return r.data;
  }
  async logout() { try { await this.request('POST', '/v1/auth/logout', { body: {} }); } catch { /* local sign-out proceeds regardless */ } await this.setTokens(null); }
}
function safeJson(t: string) { try { return JSON.parse(t); } catch { return null; } }
