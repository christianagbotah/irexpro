'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, loading, restoring, error, clearError, user, accessToken, hasAdminRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sprint 25: redirect to dashboard if already authenticated admin (but not during restore)
  useEffect(() => {
    if (!restoring && user && accessToken && hasAdminRole) {
      router.replace('/admin/dashboard');
    }
  }, [user, accessToken, restoring, hasAdminRole, router]);

  if (restoring) {
    return (
      <main className="content" style={{ maxWidth: 420, margin: '4rem auto' }}>
        <h1>Admin login</h1>
        <p className="muted">Restoring session…</p>
      </main>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/admin/dashboard');
    } catch {
      /* error is set in context */
    }
  }

  return (
    <main className="content" style={{ maxWidth: 420, margin: '4rem auto' }}>
      <h1>Admin login</h1>
      <form className="card" onSubmit={handleSubmit}>
        <p>
          <label>
            Email
            <br />
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); clearError(); }}
              disabled={loading}
            />
          </label>
        </p>
        <p>
          <label>
            Password
            <br />
            <input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              disabled={loading}
            />
          </label>
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </p>
        <p className="muted">
          Admin access requires ADMIN or SUPER_ADMIN role. The backend enforces
          RBAC via RolesGuard on all admin endpoints — a non-admin user will
          receive 403 even if this form accepts their credentials.
        </p>
      </form>
    </main>
  );
}
