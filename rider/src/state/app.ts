import { createStore } from '../core/createStore';
import { ApiError } from '../core/baseApi';
import { RiderApi } from '../core/riderApi';
import { RiderRealtime } from '../core/realtime';
import type { EarningEntry, RiderEvent, RiderSummary, RiderUser, Task } from '../core/types';
import { API_URL, WS_URL } from '../config';
import { SecureTokenStorageError, tokenStore } from '../services/tokenStore';
import { enablePush } from '../services/push';
import { popup } from '../components/Popup';
import { tap } from '../components/ui';

export const api = new RiderApi({ baseUrl: API_URL, store: tokenStore, onAuthLost: () => { void localSignOut(); popup.toast('Session expired. Please log in again.', 'info'); } });

export const session = createStore<{ status: 'boot' | 'out' | 'in'; bootError: string | null; user: RiderUser | null }>({ status: 'boot', bootError: null, user: null });
export const summary = createStore<RiderSummary & { live: boolean }>({ online: false, cashHeld: 0, active: 0, today: { deliveries: 0, earnings: 0 }, week: { deliveries: 0, earnings: 0 }, live: false });
export const tasks = createStore<{ available: Task[]; active: Task[]; done: Task[]; loaded: boolean; loading: boolean }>({ available: [], active: [], done: [], loaded: false, loading: false });
export const earnings = createStore<{ items: EarningEntry[]; loaded: boolean }>({ items: [], loaded: false });

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
const setSummary = (s: RiderSummary) => summary.set({ online: s.online, cashHeld: s.cashHeld, active: s.active, today: s.today, week: s.week });

export const realtime = new RiderRealtime({
  url: WS_URL,
  getToken: () => api.accessToken,
  onEvent: (e) => onEvent(e),
  onStatus: (s) => summary.set({ live: s === 'open' }),
  onReconnect: () => { void refreshAll(); },
});

function onEvent(e: RiderEvent) {
  const t = tasks.get();
  if (e.type === 'order_available') {
    if (!summary.get().online || t.available.some((o) => o.id === e.order.id)) return;
    tasks.set({ available: [...t.available, e.order] });
    tap();
    popup.toast(`New order · earn ₹${e.order.earning} · ${e.order.area.landmark || e.order.area.pincode}`, 'success');
  } else if (e.type === 'order_taken') {
    tasks.set({ available: t.available.filter((o) => o.id !== e.orderId) });
    if (e.riderId && e.riderId === session.get().user?.id) void refreshTasks('active');
  } else if (e.type === 'order_assigned') {
    tap();
    popup.toast('An order was assigned to you', 'info');
    void refreshAll();
  }
}

export async function refreshTasks(scope?: 'available' | 'active' | 'done') {
  const scopes = scope ? [scope] : (['available', 'active', 'done'] as const);
  tasks.set({ loading: true });
  try {
    const res = await Promise.all(scopes.map((s) => api.tasks(s)));
    const patch: any = { loaded: true };
    scopes.forEach((s, i) => { patch[s] = res[i].items; });
    tasks.set(patch);
  } catch { /* keep last known data when offline */ }
  tasks.set({ loading: false });
}
export async function refreshSummary() { try { setSummary(await api.me()); } catch { /* offline */ } }
export async function refreshEarnings() { try { const r = await api.earnings(); setSummary(r); earnings.set({ items: r.items, loaded: true }); } catch { /* offline */ } }
export async function refreshAll() { await Promise.all([refreshSummary(), refreshTasks(), refreshEarnings()]); }

export async function setOnline(online: boolean) {
  const prev = summary.get().online;
  summary.set({ online });                      // optimistic
  try { setSummary(await api.setOnline(online)); await refreshTasks('available'); if (online) void enablePush(api); }
  catch (e) { summary.set({ online: prev }); popup.alert('Could not change status', errorMessage(e), 'error'); }
}

const move = (from: 'available' | 'active', to: 'active' | 'done' | 'available', t: Task) => {
  const s = tasks.get();
  tasks.set({ [from]: s[from].filter((x) => x.id !== t.id), [to]: [t, ...s[to].filter((x) => x.id !== t.id)] } as any);
};
export async function claimTask(id: string) { const r = await api.claim(id); move('available', 'active', r.order); void refreshSummary(); return r.order; }
export async function releaseTask(id: string) { const r = await api.release(id); move('active', 'available', r.order); void refreshSummary(); return r.order; }
export async function pickupTask(id: string) { const r = await api.pickup(id); tasks.set({ active: tasks.get().active.map((x) => (x.id === id ? r.order : x)) }); return r.order; }
export async function deliverTask(id: string, code: string) {
  const r = await api.deliver(id, code);
  const s = tasks.get();
  tasks.set({ active: s.active.filter((x) => x.id !== id), done: [r.order, ...s.done] });
  setSummary(r); void refreshEarnings();
  return r.order;
}

// ------------------------------------------------------------------ session
function startServices() { realtime.start(); realtime.authenticate(); void refreshAll(); void enablePush(api); }
export async function bootstrap() {
  session.set({ status: 'boot', bootError: null });
  try {
    if (!(await api.hasSession())) { session.set({ status: 'out' }); return; }
    const me = await api.me();
    session.set({ status: 'in', user: me.rider });
    setSummary(me);
    startServices();
  } catch (e) {
    if ((e instanceof ApiError && e.isNetwork) || e instanceof SecureTokenStorageError) session.set({ bootError: e.message });
    else session.set({ status: 'out' });
  }
}
export async function afterLogin(user: RiderUser) {
  session.set({ status: 'in', user });
  try { const me = await api.me(); session.set({ user: me.rider }); setSummary(me); } catch { /* keep minimal */ }
  startServices();
}
export async function localSignOut() {
  realtime.stop();
  await api.setTokens(null);
  session.set({ status: 'out', user: null });
  tasks.set({ available: [], active: [], done: [], loaded: false });
  earnings.set({ items: [], loaded: false });
  summary.set({ online: false, cashHeld: 0, active: 0, today: { deliveries: 0, earnings: 0 }, week: { deliveries: 0, earnings: 0 } });
}
export async function signOut() {
  if (summary.get().online) { try { await api.setOnline(false); } catch { /* ignore */ } }
  await api.logout(); await localSignOut();
}
