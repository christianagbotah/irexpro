'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';
import { api } from '@/lib/api';
import { consumeSingleUseTokenFragment } from '@/lib/single-use-token-fragment';

/**
 * Reset password page.
 *
 * Email links place the single-use token in the URL fragment. Fragments are
 * never sent in the initial navigation request to the Web server/reverse proxy.
 * After hydration the token is copied only into component memory and the
 * fragment is immediately removed from browser history.
 *
 * A manual token field remains available as a fallback when the user opens the
 * page without an emailed fragment. Phone-code reset remains a separate flow.
 */
export default function ResetPasswordPage() {
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [token, setToken] = useState('');
  const [fragmentResolved, setFragmentResolved] = useState(false);
  const [hasFragmentToken, setHasFragmentToken] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const fragmentToken = consumeSingleUseTokenFragment('/reset-password');
    if (fragmentToken) {
      setToken(fragmentToken);
      setHasFragmentToken(true);
      setMode('email');
    }
    setFragmentResolved(true);
  }, []);

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
        setToken('');
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

  if (!fragmentResolved) {
    return (
      <AuthLayout title="Reset password">
        <p className="loading-text">Loading reset request…</p>
      </AuthLayout>
    );
  }

  if (success) {
    return (
      <AuthLayout title="Password reset">
        <Alert variant="success">
          Your password has been reset successfully. You can now sign in with your new password.
        </Alert>
        <div className="auth-links mt-6">
          <Link href="/login">Back to login</Link>
        </div>
      </AuthLayout>
    );
  }

  const showEmailForm = mode === 'email';

  return (
    <AuthLayout title="Reset password" subtitle="Set a new password using your reset link or phone code">
      <form onSubmit={handleSubmit}>
        {error && <Alert variant="error">{error}</Alert>}

        {!hasFragmentToken && (
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
            {hasFragmentToken ? (
              <Alert variant="info">
                Your secure reset link is loaded. The single-use token has been removed from the browser address bar.
              </Alert>
            ) : (
              <>
                <Alert variant="info">
                  Use the reset link sent to your email. If needed, you can paste a reset token below.
                </Alert>
                <Input
                  label="Reset token"
                  type="text"
                  placeholder="Paste your reset token here"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={loading}
                  required={showEmailForm}
                />
              </>
            )}
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
        Remember your password? <Link href="/login">Back to login</Link>
      </div>
    </AuthLayout>
  );
}
