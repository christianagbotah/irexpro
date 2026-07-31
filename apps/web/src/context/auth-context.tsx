'use client';

import { createContext, useContext, useCallback, useMemo, useState, ReactNode } from 'react';
import type { AuthUser, AuthTokens } from '@irexpro/types';
import { setAccessToken } from '@/lib/api';
import { api } from '@/lib/api';

/**
 * Web auth context — in-memory token storage (NOT localStorage).
 *
 * The backend is token-based: /auth/login returns { accessToken, refreshToken }
 * in the JSON body. The access token is held in memory only (lost on page
 * reload) and attached to API requests via the api client's getAccessToken
 * getter. The refresh token is also held in memory.
 *
 * Why in-memory (not localStorage):
 *   - localStorage is vulnerable to XSS token theft. The iRexPro security
 *     architecture prohibits localStorage auth in production (Sprint 10-18
 *     invariant, Sprint 22/23 runbooks). A future hardening sprint may move
 *     the refresh token to a server-set httpOnly cookie once the backend adds
 *     cookie support; until then, in-memory is the safest client-side option.
 *
 * On page reload: the user must re-login. A future enhancement can call
 * /auth/refresh with a persisted refresh token (if secure storage is added),
 * but that is out of Sprint 24 scope.
 */

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, opts?: {
    countryCode?: string; firstName?: string; lastName?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeTokens = useCallback((tokens: AuthTokens) => {
    setAccessTokenState(tokens.accessToken);
    setAccessToken(tokens.accessToken);
    setRefreshToken(tokens.refreshToken);
  }, []);

  const fetchMe = useCallback(async (token: string) => {
    setAccessToken(token);
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      // If /auth/me fails, clear the token — it may be invalid/expired
      setAccessTokenState(null);
      setAccessToken(null);
      setRefreshToken(null);
      setUser(null);
      throw err;
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await api.login({ email, password });
      storeTokens(tokens);
      await fetchMe(tokens.accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [storeTokens, fetchMe]);

  const register = useCallback(async (
    email: string,
    password: string,
    opts?: { countryCode?: string; firstName?: string; lastName?: string },
  ) => {
    setLoading(true);
    setError(null);
    try {
      const tokens = await api.register({ email, password, ...opts });
      storeTokens(tokens);
      await fetchMe(tokens.accessToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [storeTokens, fetchMe]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      if (accessToken) {
        await api.logout().catch(() => {
          // Logout endpoint may fail if token is already expired — clear locally anyway
        });
      }
    } finally {
      setAccessTokenState(null);
      setAccessToken(null);
      setRefreshToken(null);
      setUser(null);
      setLoading(false);
    }
  }, [accessToken]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    accessToken,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
  }), [user, accessToken, loading, error, login, register, logout, clearError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

/** True if the user is authenticated (has a user object + access token). */
export function useIsAuthenticated(): boolean {
  const { user, accessToken } = useAuth();
  return !!user && !!accessToken;
}
