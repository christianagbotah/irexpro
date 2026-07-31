'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

export default function RegisterPage() {
  const router = useRouter();
  const { register, loading, restoring, error, clearError, user, accessToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [countryCode, setCountryCode] = useState('');

  useEffect(() => {
    if (!restoring && user && accessToken) router.replace('/dashboard');
  }, [user, accessToken, restoring, router]);

  if (restoring) {
    return <AuthLayout title="Create account"><p className="loading-text">Restoring session…</p></AuthLayout>;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await register(email, password, {
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        countryCode: countryCode || undefined,
      });
      router.push('/dashboard');
    } catch { /* error in context */ }
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start trading with AI-powered risk-gated execution">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Input label="First name" type="text" placeholder="John" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} />
          <Input label="Last name" type="text" placeholder="Doe" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} />
        </div>
        <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={(e) => { setEmail(e.target.value); clearError(); }} disabled={loading} required />
        <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={(e) => { setPassword(e.target.value); clearError(); }} disabled={loading} required minLength={8} autoComplete="new-password" />
        <p className="muted text-sm" style={{ marginBottom: '1rem' }}>
          8+ chars with uppercase, lowercase, number, and special char (@$!%*?&).
        </p>
        <Input label="Country code (optional)" type="text" placeholder="GH" value={countryCode} onChange={(e) => setCountryCode(e.target.value.toUpperCase())} disabled={loading} maxLength={2} minLength={2} />
        <Button type="submit" block size="lg" loading={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
      <div className="auth-divider">or</div>
      <div className="auth-links">
        Already have an account? <Link href="/login">Log in</Link>
      </div>
    </AuthLayout>
  );
}
