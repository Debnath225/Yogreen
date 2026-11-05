import { createStore } from '../core/createStore';
import type { Address } from '../core/types';

/** Holds answers across the 3 setup screens; sent to the server in one atomic call on the last step. */
export const setupDraft = createStore<{ name: string; email: string; address: Omit<Address, 'id'>; pushEnabled: boolean }>({
  name: '', email: '', pushEnabled: true,
  address: { label: 'Home', line1: '', landmark: '', pincode: '' },
});
