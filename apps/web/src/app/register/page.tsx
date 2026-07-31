'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';

export default function RegisterPage() {
  const router = useRouter();
  const { register, loading, restoring, error, clearError, user, accessToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [countryCode, setCountryCode] = useState('');

  // Sprint 25: redirect to dashboard if already authenticated (but not during restore)
  useEffect(() => {
    if (!restoring && user && accessToken) {
      router.replace('/dashboard');
    }
  }, [user, accessToken, restoring, router]);

  if (restoring) {
    return (
      <main className="page">
        <h1>Create your account</h1>
        <p className="muted">Restoring session…</p>
      </main>
    );
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
    } catch {
      /* error is set in context */
    }
  }

  return (
    <main className="page">
      <h1>Create your account</h1>
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
              autoComplete="new-password"
              minLength={8}
              value={password}
              onChange={(e) => { setPassword(e.target.value); clearError(); }}
              disabled={loading}
            />
          </label>
        </p>
        <p className="muted">
          Must be 8+ chars with uppercase, lowercase, number, and special char
          (@$!%*?&).
        </p>
        <p>
          <label>
            First name (optional)
            <br />
            <input
              name="firstName"
              type="text"
              maxLength={100}
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={loading}
            />
          </label>
        </p>
        <p>
          <label>
            Last name (optional)
            <br />
            <input
              name="lastName"
              type="text"
              maxLength={100}
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={loading}
            />
          </label>
        </p>
        <p>
          <label>
            Country code (optional, 2 letters)
            <br />
            <input
              name="countryCode"
              type="text"
              minLength={2}
              maxLength={2}
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
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
            {loading ? 'Creating account…' : 'Register'}
          </button>
        </p>
        <p className="muted">
          Already have an account? <Link href="/login">Log in</Link>
        </p>
        <p className="muted">
          Registration is handled by the backend at{' '}
          <code>/api/v1/auth/register</code>. New accounts start in
          PENDING_VERIFICATION status.
        </p>
      </form>
    </main>
  );
}
