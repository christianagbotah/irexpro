'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, restoring, error, clearError, user, accessToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
      await login(email, password);
      router.push('/dashboard');
    } catch { /* error in context */ }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Log in to your iRexPro account">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}
        <Input
          label="Email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => { setEmail(e.target.value); clearError(); }}
          disabled={loading}
          required
          autoComplete="email"
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
        <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
          <Link href="/forgot-password" className="text-sm">Forgot password?</Link>
        </div>
        <Button type="submit" block size="lg" loading={loading}>
          {loading ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
      <div className="auth-divider">or</div>
      <div className="auth-links">
        Don&apos;t have an account? <Link href="/register">Create one</Link>
      </div>
    </AuthLayout>
  );
}
