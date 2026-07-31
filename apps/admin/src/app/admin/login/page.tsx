'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, loading, restoring, error, clearError, user, accessToken, hasAdminRole } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (!restoring && user && accessToken && hasAdminRole) {
      router.replace('/admin/dashboard');
    }
  }, [user, accessToken, restoring, hasAdminRole, router]);

  if (restoring) {
    return <AuthLayout title="Admin login"><p className="loading-text">Restoring session…</p></AuthLayout>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(identifier, password, rememberMe);
      router.push('/admin/dashboard');
    } catch { /* error in context */ }
  }

  return (
    <AuthLayout title="Admin login" subtitle="Sign in to the iRexPro back-office portal">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Email or international phone number"
          type="text"
          placeholder="admin@irexpro.com"
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
