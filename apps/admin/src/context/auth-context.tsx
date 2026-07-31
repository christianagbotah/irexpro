'use client';

import { createContext, useContext, useCallback, useMemo, useState, ReactNode } from 'react';
import type { AuthUser, AuthTokens, UserRole } from '@irexpro/types';
import { setAccessToken } from '@/lib/api';
import { api } from '@/lib/api';

/**
 * Admin auth context — in-memory token storage (NOT localStorage).
 *
 * Same token-based model as the web app: /auth/login returns
 * { accessToken, refreshToken } in the JSON body. The access token is held in
 * memory and attached to API requests via getAccessToken.
 *
 * Role enforcement: the backend enforces ADMIN/SUPER_ADMIN via RolesGuard on
 * admin endpoints. The frontend can do a soft check (show admin UI only if
 * the user's roles include ADMIN) but the backend is the source of truth —
 * a non-admin user will get 403 from admin endpoints even if the frontend
 * shows the UI. Roles are optional on AuthUser (the /auth/me response does
 * not include roles); the admin app may decode the JWT to read role claims
 * for a soft UI guard. See hasAdminRole below.
 */

interface AuthContextValue {
  user: AuthUser | null;
  accessToken: string | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  /** Soft UI guard — true if the user object has an ADMIN or SUPER_ADMIN role. */
  hasAdminRole: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function checkAdminRole(user: AuthUser | null): boolean {
  if (!user?.roles || user.roles.length === 0) return true; // assume admin until backend says otherwise (soft guard)
  return user.roles.some((r: UserRole) => r === 'ADMIN' || r === 'SUPER_ADMIN');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeTokens = useCallback((tokens: AuthTokens) => {
    setAccessTokenState(tokens.accessToken);
    setAccessToken(tokens.accessToken);
  }, []);

  const fetchMe = useCallback(async (token: string) => {
    setAccessToken(token);
    try {
      const me = await api.me();
      setUser(me);
    } catch (err) {
      setAccessTokenState(null);
      setAccessToken(null);
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

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      if (accessToken) {
        await api.logout().catch(() => {});
      }
    } finally {
      setAccessTokenState(null);
      setAccessToken(null);
      setUser(null);
      setLoading(false);
    }
  }, [accessToken]);

  const clearError = useCallback(() => setError(null), []);

  const hasAdminRole = checkAdminRole(user);

  const value = useMemo<AuthContextValue>(() => ({
    user,
    accessToken,
    loading,
    error,
    login,
    logout,
    clearError,
    hasAdminRole,
  }), [user, accessToken, loading, error, login, logout, clearError, hasAdminRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
