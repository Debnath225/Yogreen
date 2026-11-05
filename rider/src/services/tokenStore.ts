import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '../core/baseApi';
import type { Tokens } from '../core/types';

const KEY = 'yg.rider.tokens.v1';
const OPTIONS = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export class SecureTokenStorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'SecureTokenStorageError';
  }
}

export const tokenStore: TokenStore = {
  async load() {
    let value: string | null;
    try {
      value = await SecureStore.getItemAsync(KEY, OPTIONS);
    } catch (error) {
      throw new SecureTokenStorageError('Unable to read authentication tokens from secure storage.', error);
    }
    if (!value) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch (error) {
      throw new SecureTokenStorageError('Stored authentication tokens are invalid. Please sign in again.', error);
    }
    if (
      typeof parsed !== 'object'
      || parsed === null
      || typeof (parsed as Tokens).accessToken !== 'string'
      || !(parsed as Tokens).accessToken
      || typeof (parsed as Tokens).refreshToken !== 'string'
      || !(parsed as Tokens).refreshToken
    ) {
      throw new SecureTokenStorageError('Stored authentication tokens are invalid. Please sign in again.');
    }
    return parsed as Tokens;
  },
  async save(t) {
    try {
      if (t) await SecureStore.setItemAsync(KEY, JSON.stringify(t), OPTIONS);
      else await SecureStore.deleteItemAsync(KEY, OPTIONS);
    } catch (error) {
      throw new SecureTokenStorageError('Unable to save authentication tokens to secure storage.', error);
    }
  },
};
