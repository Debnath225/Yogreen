import { useSyncExternalStore } from 'react';
import type { Store } from '../core/createStore';

/** Selector must return a primitive or a stable reference (it is compared with Object.is). */
export function useStore<T extends object, S>(store: Store<T>, selector: (s: T) => S): S {
  return useSyncExternalStore(store.subscribe, () => selector(store.get()), () => selector(store.get()));
}
