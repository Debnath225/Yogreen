/** Tiny external store (no dependency). Hook adapter lives in state/useStore.ts */
export interface Store<T> { get(): T; set(patch: Partial<T> | ((s: T) => Partial<T>)): void; subscribe(fn: () => void): () => void }
export function createStore<T extends object>(initial: T): Store<T> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const p = typeof patch === 'function' ? patch(state) : patch;
      state = { ...state, ...p };
      subs.forEach((f) => f());
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
