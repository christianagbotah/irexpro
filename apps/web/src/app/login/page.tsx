'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, restoring, error, clearError, user, accessToken } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    if (!restoring && user && accessToken) {
      router.replace('/dashboard');
    }
  }, [user, accessToken, restoring, router]);

  if (restoring) {
    return (
      <AuthLayout title="Log in">
        <p className="loading-text">Restoring session…</p>
      </AuthLayout>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(identifier, password, rememberMe);
      router.push('/dashboard');
    } catch { /* error in context */ }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your iRexPro account">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Email or international phone number"
          type="text"
          placeholder="you@example.com or +233241234567"
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
          <Link href="/forgot-password" className="text-sm">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" loading={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="auth-links" style={{ marginTop: '1rem' }}>
        Can&apos;t access your account? <Link href="/account-appeal">Request a review</Link>
      </div>
      <div className="auth-divider">or</div>
      <div className="auth-links">
        Don&apos;t have an account? <Link href="/register">Create one</Link>
      </div>
    </AuthLayout>
  );
}
