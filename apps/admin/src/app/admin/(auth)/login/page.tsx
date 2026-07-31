'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

/**
 * Admin login page — public, NO sidebar.
 *
 * Hotfix: this page now lives in the (auth) route group, which uses a bare
 * layout (no sidebar, no admin nav). Previously it was wrapped by
 * app/admin/layout.tsx which rendered the full sidebar.
 *
 * Behavior:
 *  - Accepts email OR international phone number as identifier.
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
    return (
      <AuthLayout title="Access denied" subtitle="Your account does not have admin access">
        <Alert variant="error">
          You are signed in as <code>{user.email ?? user.phone ?? 'unknown'}</code> with roles:{' '}
          <code>{user.roles?.join(', ') || 'none'}</code>. Admin access requires the ADMIN or
          SUPER_ADMIN role.
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
      await login(identifier, password, rememberMe);
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
        Admin access requires ADMIN or SUPER_ADMIN role. The backend enforces RBAC via RolesGuard.
      </Alert>
    </AuthLayout>
  );
}
