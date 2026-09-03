'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';
import { formatEnumLabel } from '@irexpro/types';

/**
 * Admin login page — public, NO sidebar.
 *
 * Hotfix: this page now lives in the (auth) route group, which uses a bare
 * layout (no sidebar, no admin nav). Previously it was wrapped by
 * app/admin/layout.tsx which rendered the full sidebar.
 *
 * Behavior:
 *  - Accepts email OR international phone number as identifier.
 *  - Always offers an optional TOTP field so the UI does not reveal whether a
 *    particular account has MFA configured.
 *  - Uses the same /auth/login endpoint as the web app.
 *  - After login, fetches /auth/me (via the AuthProvider).
 *  - If the user has ADMIN/SUPER_ADMIN role → redirect to /admin/dashboard.
 *  - If the user is signed in but lacks admin role → show "Access denied"
 *    on the login page itself, with a sign-out button. Do NOT redirect to
 *    the dashboard (they would just see the access-denied card there too,
 *    but showing it here is clearer).
 */
export default function AdminLoginPage() {
  const router = useRouter();
  const { login, logout, loading, restoring, error, clearError, user, accessToken, hasAdminRole } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  // Redirect authenticated admins to the dashboard.
  useEffect(() => {
    if (!restoring && user && accessToken && hasAdminRole) {
      router.replace('/admin/dashboard');
    }
  }, [user, accessToken, restoring, hasAdminRole, router]);

  if (restoring) {
    return (
      <AuthLayout title="Admin login">
        <p className="loading-text">Restoring session…</p>
      </AuthLayout>
    );
  }

  // Signed in but NOT an admin — show access denied on the login page.
  if (user && !hasAdminRole) {
    const humanRoles = (user.roles ?? []).map((r) => formatEnumLabel(r)).join(', ') || 'none';
    return (
      <AuthLayout title="Access denied" subtitle="Your account does not have admin access">
        <Alert variant="error">
          You are signed in as <code>{user.email ?? user.phone ?? 'unknown'}</code> with roles:{' '}
          <code>{humanRoles}</code>. Admin access requires the Admin or
          Super Admin role.
        </Alert>
        <Button
          variant="secondary"
          block
          size="lg"
          onClick={() => logout()}
          loading={loading}
          style={{ marginTop: '1rem' }}
        >
          Sign out
        </Button>
      </AuthLayout>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(identifier, password, rememberMe, mfaCode || undefined);
      // The useEffect above will redirect once /auth/me confirms the admin
      // role. We don't push to /admin/dashboard here unconditionally, because
      // if the user is not an admin they should see the access-denied state
      // on this page rather than being redirected and bounced back.
    } catch { /* error in context */ }
  }

  return (
    <AuthLayout title="Admin login" subtitle="Sign in to the iRexPro back-office portal">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Email or international phone number"
          type="text"
          placeholder="admin@irexpro.com or +233…"
          value={identifier}
          onChange={(e) => { setIdentifier(e.target.value); clearError(); }}
          disabled={loading}
          required
          autoComplete="username"
        />
        <Input
          label="Password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => { setPassword(e.target.value); clearError(); }}
          disabled={loading}
          required
          autoComplete="current-password"
        />
        <Input
          label="Authenticator code (if enabled)"
          type="text"
          placeholder="123456"
          value={mfaCode}
          onChange={(e) => {
            setMfaCode(e.target.value.replace(/\D/gu, '').slice(0, 6));
            clearError();
          }}
          disabled={loading}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          aria-describedby="admin-login-mfa-help"
        />
        <p id="admin-login-mfa-help" className="text-sm muted" style={{ marginTop: '-0.5rem', marginBottom: '1rem' }}>
          If multi-factor authentication is enabled, enter the current 6-digit code. Leave this blank otherwise.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
              style={{ width: '16px', height: '16px', accentColor: 'var(--brand)' }}
            />
            <span className="text-sm muted">Remember me</span>
          </label>
          <Link href="/admin/forgot-password" className="text-sm">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" loading={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>
      <Alert variant="info">
        Admin access requires the Admin or Super Admin role. The backend enforces RBAC via RolesGuard.
      </Alert>
    </AuthLayout>
  );
}
