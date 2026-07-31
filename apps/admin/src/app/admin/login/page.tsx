'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, loading, restoring, error, clearError, user, accessToken, hasAdminRole } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

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
      await login(email, password);
      router.push('/admin/dashboard');
    } catch { /* error in context */ }
  }

  return (
    <AuthLayout title="Admin login" subtitle="Sign in to the iRexPro back-office portal">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}
        <Input label="Email" type="email" placeholder="admin@irexpro.com" value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} disabled={loading} required autoComplete="email" />
        <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); clearError(); }} disabled={loading} required autoComplete="current-password" />
        <div style={{ textAlign: 'right', marginBottom: '1rem' }}>
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
