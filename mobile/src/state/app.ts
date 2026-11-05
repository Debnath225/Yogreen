import { createStore } from '../core/createStore';
import { ApiClient, ApiError } from '../core/api';
import { Realtime } from '../core/realtime';
import { setQty } from '../core/cartMath';
import type { Address, AppNotification, AuthResult, CartLine, Order, Product, User, WalletSummary } from '../core/types';
import { API_URL, WS_URL } from '../config';
import { SecureTokenStorageError, tokenStore } from '../services/tokenStore';
import { enablePush } from '../services/push';
import { popup } from '../components/Popup';

// ------------------------------------------------------------------ session
interface Session { status: 'boot' | 'out' | 'in'; bootError: string | null; user: User | null; addresses: Address[]; wallet: WalletSummary | null }
export const session = createStore<Session>({ status: 'boot', bootError: null, user: null, addresses: [], wallet: null });
export const catalog = createStore<{ items: Product[]; map: Map<string, Product>; categories: string[]; status: 'idle' | 'loading' | 'ready' | 'error'; flash: Record<string, 'up' | 'down'>; live: boolean }>({ items: [], map: new Map(), categories: [], status: 'idle', flash: {}, live: false });
export const cart = createStore<{ lines: CartLine[] }>({ lines: [] });
export const inbox = createStore<{ items: AppNotification[]; unread: number }>({ items: [], unread: 0 });
export const ordersStore = createStore<{ items: Order[]; loaded: boolean; loading: boolean }>({ items: [], loaded: false, loading: false });

export const api: ApiClient = new ApiClient({ baseUrl: API_URL, store: tokenStore, onAuthLost: () => { void localSignOut(); popup.toast('Session expired. Please log in again.', 'info'); } });

// ----------------------------------------------------------------- realtime
export const realtime = new Realtime({
  url: WS_URL,
  getToken: () => api.accessToken,
  onPrices: (items) => applyPrices(items),
  onNotification: (n) => onLiveNotification(n),
  onStatus: (s) => catalog.set({ live: s === 'open' }),
  onReconnect: () => { void loadCatalog(true); void refreshInbox(); },
});

export function applyPrices(items: Product[]) {
  const cur = catalog.get();
  const map = new Map(cur.map);
  const flash = { ...cur.flash };
  for (const it of items) {
    const old = map.get(it.id);
    if (old && it.v <= old.v) continue; // stale update
    if (old && it.price !== old.price) flash[it.id] = it.price < old.price ? 'down' : 'up';
    map.set(it.id, it);
  }
  catalog.set({ map, items: [...map.values()], flash });
}

function onLiveNotification(n: AppNotification) {
  const cur = inbox.get();
  if (cur.items.some((x) => x.id === n.id)) return;
  inbox.set({ items: [{ ...n, unread: true }, ...cur.items], unread: cur.unread + 1 });
  popup.toast(`${n.title} — ${n.body}`, 'info');
  if (n.data?.type === 'order') { void refreshOrders(); void refreshMe(); }
}

// ------------------------------------------------------------------ catalog
export async function loadCatalog(silent = false) {
  if (!silent) catalog.set({ status: catalog.get().items.length ? 'ready' : 'loading' });
  try {
    const d = await api.products();
    const map = new Map(d.items.map((p) => [p.id, p]));
    catalog.set({ items: d.items, map, categories: d.categories, status: 'ready' });
  } catch {
    catalog.set({ status: catalog.get().items.length ? 'ready' : 'error' });
  }
}

// --------------------------------------------------------------------- cart
export async function loadCart() {
  try { const remote = await api.cart(); cart.set({ lines: remote.items }); }
  catch (error) { popup.toast(`Could not load your saved cart: ${errorMessage(error)}`, 'error'); }
}
let cartSync: Promise<void> = Promise.resolve();
const persistCart = () => {
  const ownerId = session.get().user?.id;
  if (!ownerId) return;
  const lines = cart.get().lines;
  cartSync = cartSync.catch(() => undefined).then(async () => {
    if (session.get().user?.id !== ownerId) return;
    await api.updateCart(lines);
  }).catch((error: unknown) => {
    if (session.get().user?.id === ownerId) popup.toast(`Could not save your cart: ${errorMessage(error)}`, 'error');
  });
};
export function setLineQty(productId: string, qty: number) { cart.set({ lines: setQty(cart.get().lines, productId, qty) }); persistCart(); }
export function clearCart() { cart.set({ lines: [] }); persistCart(); }

// ------------------------------------------------------------------- orders
export async function refreshOrders() {
  ordersStore.set({ loading: true });
  try { const r = await api.orders(); ordersStore.set({ items: r.items, loaded: true, loading: false }); }
  catch { ordersStore.set({ loading: false }); }
}

// ------------------------------------------------------------------- inbox
export async function refreshInbox() {
  try { const r = await api.notifications(); inbox.set({ items: r.items, unread: r.unread }); } catch { /* offline */ }
}
export async function markInboxRead() {
  if (!inbox.get().unread) return;
  inbox.set({ unread: 0, items: inbox.get().items.map((n) => ({ ...n, unread: false })) });
  try { await api.markNotificationsRead(); } catch { /* retry next open */ }
}

// ------------------------------------------------------------------ session
export async function refreshMe() {
  try { const r = await api.me(); session.set({ user: r.user, addresses: r.addresses, wallet: r.wallet }); } catch (e) { if (!(e instanceof ApiError && e.isNetwork)) throw e; }
}
export function setWallet(w: WalletSummary) { session.set({ wallet: w }); }

function startSignedInServices(user: User) {
  realtime.start();
  realtime.authenticate();
  void refreshInbox();
  void refreshOrders();
  if (user.prefs?.pushEnabled) void enablePush(api);
}

export async function bootstrap() {
  session.set({ status: 'boot', bootError: null });
  void loadCatalog();
  try {
    if (!(await api.hasSession())) { session.set({ status: 'out' }); return; }
    const r = await api.me();
    session.set({ status: 'in', user: r.user, addresses: r.addresses, wallet: r.wallet });
    await loadCart();
    startSignedInServices(r.user);
  } catch (e) {
    if ((e instanceof ApiError && e.isNetwork) || e instanceof SecureTokenStorageError) session.set({ bootError: e.message });
    else session.set({ status: 'out' });
  }
}

export async function afterLogin(a: AuthResult) {
  session.set({ status: 'boot', bootError: null, user: a.user });
  try { const r = await api.me(); session.set({ user: r.user, addresses: r.addresses, wallet: r.wallet }); } catch { /* keep minimal user */ }
  await loadCart();
  session.set({ status: 'in' });
  startSignedInServices(session.get().user ?? a.user);
}

export async function finishSetup(input: { name: string; email?: string; address: Omit<Address, 'id'>; pushEnabled: boolean }) {
  const r = await api.completeSetup({ name: input.name, email: input.email || undefined, address: input.address, prefs: { pushEnabled: input.pushEnabled } });
  session.set({ user: r.user, addresses: r.addresses, wallet: r.wallet });
  if (input.pushEnabled) void enablePush(api);
  return r.bonusGranted;
}

export async function localSignOut() {
  realtime.stop();
  await api.setTokens(null);
  cart.set({ lines: [] });
  session.set({ status: 'out', user: null, addresses: [], wallet: null });
  inbox.set({ items: [], unread: 0 });
  ordersStore.set({ items: [], loaded: false });
}
export async function signOut() { await api.logout(); await localSignOut(); }
export async function deleteAccount() { await api.deleteAccount(); await localSignOut(); }

export const newIdempotencyKey = () => `yg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong. Please try again.');
