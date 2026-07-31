import { createContext, useContext, useCallback, useMemo, useState, useEffect } from 'react';
import type { AuthUser } from '@irexpro/types';
import { setAccessToken } from '@/lib/api';
import { api } from '@/lib/api';
import { saveTokens, getAccessToken, clearTokens } from '@/lib/secure-storage';

/**
 * Mobile auth context — Expo SecureStore token persistence.
 *
 * Sprint 25: tokens are persisted in the platform secure storage (iOS
 * Keychain / Android Keystore) via expo-secure-store. Sessions survive app
 * restarts. On app launch, the context attempts to restore the session by
 * reading the stored access token and calling /auth/me. If the access token
 * is expired, a future enhancement can call /auth/refresh with the stored
 * refresh token.
 *
 * AsyncStorage is NEVER used for tokens (prohibited — mobile equivalent of
 * localStorage, not encrypted at rest).
 */

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setSession = useCallback((u: AuthUser, token: string) => {
    setUser(u);
    setAccessTokenState(token);
    setAccessToken(token);
  }, []);

  const clearSession = useCallback(async () => {
    setUser(null);
    setAccessTokenState(null);
    setAccessToken(null);
    await clearTokens();
  }, []);

  const restoreSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const storedToken = await getAccessToken();
      if (!storedToken) {
        setLoading(false);
        return;
      }
      setAccessToken(storedToken);
      try {
        const me = await api.me();
        setUser(me);
        setAccessTokenState(storedToken);
      } catch {
        // Access token is expired or invalid — clear it
        await clearTokens();
        setAccessToken(null);
        setAccessTokenState(null);
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore session on mount (app launch)
  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const value = useMemo(() => ({
    user, accessToken, loading, error, setSession, clearSession, restoreSession,
  }), [user, accessToken, loading, error, setSession, clearSession, restoreSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
