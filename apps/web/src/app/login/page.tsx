'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

export default function LoginPage() {
  const router = useRouter();
  const { login, loading, restoring, error, clearError, user, accessToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Sprint 25: redirect to dashboard if already authenticated (but not during restore)
  useEffect(() => {
    if (!restoring && user && accessToken) {
      router.replace('/dashboard');
    }
  }, [user, accessToken, restoring, router]);

  // Show loading state during session restore (avoid flash of login form)
  if (restoring) {
    return (
      <main className="page">
        <h1>Log in</h1>
        <p className="muted">Restoring session…</p>
      </main>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch {
      /* error is set in context */
    }
  }

  return (
    <main className="page">
      <h1>Log in</h1>
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
          Don&apos;t have an account?{' '}
          <Link href="/register">Register</Link>
        </p>
        <p className="muted">
          Auth is handled by the backend at <code>/api/v1/auth/login</code>.
          Tokens are held in memory only — never in localStorage.
        </p>
      </form>
    </main>
  );
}
