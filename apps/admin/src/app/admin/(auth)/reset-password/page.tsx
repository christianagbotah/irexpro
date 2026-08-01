'use client';

import { useState, FormEvent, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';
import { api } from '@/lib/api';

/**
 * Admin reset password page — Sprint 28.
 *
 * Wired to the same POST /auth/reset-password endpoint as the web app.
 * After success, the user returns to /admin/login.
 */
function AdminResetPasswordContent() {
  const searchParams = useSearchParams();
  const urlToken = searchParams.get('token');

  const [mode, setMode] = useState<'email' | 'phone'>(urlToken ? 'email' : 'email');
  const [token, setToken] = useState(urlToken ?? '');
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (urlToken) setToken(urlToken);
  }, [urlToken]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 12) {
      setError('Password must be at least 12 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      setError('Password must contain at least one letter and one number.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'email') {
        if (!token) {
          setError('Reset token is missing. Use the link from your reset email.');
          setLoading(false);
          return;
        }
        await api.resetPassword({ token, password });
      } else {
        if (!identifier || !code) {
          setError('Phone number and code are required for phone code reset.');
          setLoading(false);
          return;
        }
        await api.resetPassword({ identifier, code, password });
      }
      setSuccess(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Password reset failed. The link may be invalid or expired.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <AuthLayout title="Password reset">
        <Alert variant="success">
          Your password has been reset successfully. You can now sign in with your new password.
        </Alert>
        <div className="auth-links mt-6">
          <Link href="/admin/login">Back to admin login</Link>
        </div>
      </AuthLayout>
    );
  }

  const showEmailForm = mode === 'email';

  return (
    <AuthLayout title="Reset password" subtitle="Set a new password using your reset link or phone code">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}

        {!urlToken && (
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            <Button
              type="button"
              variant={showEmailForm ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMode('email')}
            >
              Email link
            </Button>
            <Button
              type="button"
              variant={!showEmailForm ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setMode('phone')}
            >
              Phone code
            </Button>
          </div>
        )}

        {showEmailForm ? (
          <>
            {!urlToken && (
              <Alert variant="info">
                Use the reset link sent to your email. If you have the link, open it or paste the
                token below.
              </Alert>
            )}
            <Input
              label="Reset token"
              type="text"
              placeholder="Paste your reset token here"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              disabled={loading || Boolean(urlToken)}
              required={showEmailForm}
            />
          </>
        ) : (
          <>
            <Alert variant="info">
              Enter the phone number you used to register and the 6-digit code sent via SMS.
            </Alert>
            <Input
              label="Phone number"
              type="text"
              placeholder="+233241234567"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              disabled={loading}
              required={!showEmailForm}
            />
            <Input
              label="6-digit code"
              type="text"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              disabled={loading}
              maxLength={6}
              required={!showEmailForm}
            />
          </>
        )}

        <Input
          label="New password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
          required
          autoComplete="new-password"
        />
        <Input
          label="Confirm new password"
          type="password"
          placeholder="••••••••"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          disabled={loading}
          required
          autoComplete="new-password"
        />
        <Button type="submit" block size="lg" loading={loading}>
          {loading ? 'Resetting…' : 'Reset password'}
        </Button>
      </form>
      <div className="auth-links mt-6">
        <Link href="/admin/login">Back to admin login</Link>
      </div>
    </AuthLayout>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <Suspense fallback={<AuthLayout title="Reset password"><p className="loading-text">Loading…</p></AuthLayout>}>
      <AdminResetPasswordContent />
    </Suspense>
  );
}
