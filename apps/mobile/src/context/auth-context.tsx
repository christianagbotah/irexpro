import { createContext, useContext, useCallback, useMemo, useState } from 'react';
import type { AuthUser } from '@irexpro/types';
import { setAccessToken } from '@/lib/api';

/**
 * Mobile auth context — in-memory token storage (foundation).
 *
 * For production, tokens should be persisted in the platform secure storage
 * (expo-secure-store / Keychain / Keystore). AsyncStorage is prohibited
 * (mobile equivalent of localStorage). Adding expo-secure-store is a
 * documented next step — see apps/mobile/.env.example note.
 */

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  setSession: (user: AuthUser, accessToken: string) => void;
  clearSession: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [accessToken, setAccessTokenState] = useState<string | null>(null);

  const setSession = useCallback((u: AuthUser, token: string) => {
    setUser(u);
    setAccessTokenState(token);
    setAccessToken(token);
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessTokenState(null);
    setAccessToken(null);
  }, []);

  const value = useMemo(() => ({ user, accessToken, setSession, clearSession }), [
    user, accessToken, setSession, clearSession,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
