/**
 * Mobile secure token storage using Expo SecureStore.
 *
 * Sprint 25: tokens (access + refresh) are persisted in the platform secure
 * storage (iOS Keychain / Android Keystore) via expo-secure-store. This
 * survives app restarts so the user stays logged in. AsyncStorage is
 * prohibited (mobile equivalent of localStorage — vulnerable to backup
 * extraction and not encrypted at rest).
 *
 * Keys are namespaced with 'irexpro-' to avoid collisions.
 */

import * as SecureStore from 'expo-secure-store';
import type { AuthTokens } from '@irexpro/types';

const ACCESS_TOKEN_KEY = 'irexpro-access-token';
const REFRESH_TOKEN_KEY = 'irexpro-refresh-token';

export async function saveTokens(tokens: AuthTokens): Promise<void> {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED,
  });
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function clearTokens(): Promise<void> {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY).catch(() => {});
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY).catch(() => {});
}
