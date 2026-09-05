import { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import { ApiClientError } from '@irexpro/api-client';
import type { AuthTokens, AuthUser } from '@irexpro/types';
import { api, setAccessToken } from '@/lib/api';
import {
  saveTokens,
  getAccessToken,
  getRefreshToken,
  clearTokens,
} from '@/lib/secure-storage';

/**
 * Mobile auth context — Expo SecureStore token persistence and rotation.
 *
 * Access + refresh tokens live only in platform secure storage (iOS Keychain /
 * Android Keystore) and in memory while the app is active. On app launch we
 * first validate a stored access token. A 401 may be recovered by rotating the
 * stored refresh token through /auth/refresh. Transient network/server failures
 * never erase otherwise valid SecureStore credentials.
 *
 * AsyncStorage is NEVER used for tokens (prohibited — mobile equivalent of
 * localStorage, not encrypted at rest).
 */

const RESTORE_TRANSIENT_ERROR =
  'Unable to restore your session right now. Check your connection and try again.';
const SECURE_STORAGE_ERROR =
  'Secure session storage is unavailable. Please sign in again.';

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  setSession: (user: AuthUser, accessToken: string) => void;
  clearSession: () => void;
  restoreSession: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function isUnauthorized(error: unknown): boolean {
  return error instanceof ApiClientError && error.statusCode === 401;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearInMemorySession = useCallback(() => {
    setUser(null);
    setAccessTokenState(null);
    setAccessToken(null);
  }, []);

  const setSession = useCallback((u: AuthUser, token: string) => {
    setUser(u);
    setAccessTokenState(token);
    setAccessToken(token);
    setError(null);
  }, []);

  const clearSession = useCallback(async () => {
    clearInMemorySession();
    setError(null);
    await clearTokens();
  }, [clearInMemorySession]);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [storedAccessToken, storedRefreshToken] = await Promise.all([
        getAccessToken(),
        getRefreshToken(),
      ]);

      if (!storedAccessToken && !storedRefreshToken) {
        clearInMemorySession();
        return;
      }

      if (storedAccessToken) {
        setAccessToken(storedAccessToken);
        try {
          const me = await api.me();
          setSession(me, storedAccessToken);
          return;
        } catch (accessError) {
          if (!isUnauthorized(accessError)) {
            // Preserve SecureStore credentials across temporary outages, but
            // do not leave an unvalidated token installed in the live client.
            clearInMemorySession();
            setError(RESTORE_TRANSIENT_ERROR);
            return;
          }
        }
      }

      if (!storedRefreshToken) {
        await clearTokens();
        clearInMemorySession();
        return;
      }

      // Never send the rejected/unknown access token alongside refresh. The
      // mobile refresh credential is supplied explicitly in the JSON body.
      clearInMemorySession();

      let rotatedTokens: AuthTokens;
      try {
        rotatedTokens = await api.refresh(storedRefreshToken);
      } catch (refreshError) {
        if (isUnauthorized(refreshError)) {
          await clearTokens();
          clearInMemorySession();
          return;
        }

        // Network errors and server failures must not destroy a refresh token
        // that may still be valid. A later retry can recover the session.
        clearInMemorySession();
        setError(RESTORE_TRANSIENT_ERROR);
        return;
      }

      // Rotation invalidates the previous refresh generation. Persist the new
      // pair before exposing the session as active so an app restart cannot
      // fall back to a stale/replayed refresh token.
      try {
        await saveTokens(rotatedTokens);
      } catch {
        await clearTokens();
        clearInMemorySession();
        setError(SECURE_STORAGE_ERROR);
        return;
      }

      setAccessToken(rotatedTokens.accessToken);
      try {
        const me = await api.me();
        setSession(me, rotatedTokens.accessToken);
      } catch (identityError) {
        if (isUnauthorized(identityError)) {
          await clearTokens();
          clearInMemorySession();
          return;
        }

        // The rotated pair is already safely persisted. Preserve it and let a
        // later restore retry recover after the transient API failure.
        clearInMemorySession();
        setError(RESTORE_TRANSIENT_ERROR);
      }
    } finally {
      setLoading(false);
    }
  }, [clearInMemorySession, setSession]);

  // Restore session on mount (app launch).
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const value = useMemo(
    () => ({
      user,
      accessToken,
      loading,
      error,
      setSession,
      clearSession,
      restoreSession,
    }),
    [user, accessToken, loading, error, setSession, clearSession, restoreSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
