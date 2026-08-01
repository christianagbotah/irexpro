'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';
import { api } from '@/lib/api';

/**
 * Forgot password page — Sprint 28.
 *
 * Wired to the real POST /auth/forgot-password endpoint. The backend ALWAYS
 * returns the same generic message whether or not the account exists — this
 * prevents account enumeration. We show the same generic message here.
 *
 * Accepts email OR international phone number as the identifier.
 */
export default function ForgotPasswordPage() {
  const [identifier, setIdentifier] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword({ identifier });
      setSubmitted(true);
    } catch (err) {
      // Even on error, show the generic message — the backend may return 429
      // (rate limit) or 500, but we don't want to reveal account state.
      // Only show a real error if it's a network issue.
      const msg = err instanceof Error && err.message.includes('Network')
        ? 'Unable to reach the server. Please check your connection and try again.'
        : null;
      if (msg) {
        setError(msg);
      } else {
        // Non-network error — show the generic success message (no enumeration)
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Forgot password" subtitle="Enter your email or phone number to receive reset instructions">
      {submitted ? (
        <Alert variant="info">
          If an account exists for this identifier, password reset instructions have been sent.
          Please check your email (including spam) or phone messages.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit}>
          {error && <Alert variant="error">{error}</Alert>}
          <Input
            label="Email or phone number"
            type="text"
            placeholder="you@example.com or +233241234567"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            disabled={loading}
            required
            autoComplete="username"
          />
          <Button type="submit" block size="lg" loading={loading}>
            {loading ? 'Sending…' : 'Send reset instructions'}
          </Button>
        </form>
      )}
      <div className="auth-links mt-6">
        Remember your password? <Link href="/login">Back to login</Link>
      </div>
    </AuthLayout>
  );
}
