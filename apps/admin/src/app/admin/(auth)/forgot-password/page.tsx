'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';
import { api } from '@/lib/api';

/**
 * Admin forgot password page — Sprint 28.
 *
 * Wired to the same POST /auth/forgot-password endpoint as the web app.
 * The backend ALWAYS returns the same generic message — no account enumeration.
 *
 * Accepts email OR international phone number as the identifier.
 */
export default function AdminForgotPasswordPage() {
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
      const msg = err instanceof Error && err.message.includes('Network')
        ? 'Unable to reach the server. Please check your connection and try again.'
        : null;
      if (msg) {
        setError(msg);
      } else {
        setSubmitted(true);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Forgot password" subtitle="Enter your admin email or phone to receive reset instructions">
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
            placeholder="admin@irexpro.com or +233241234567"
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
        <Link href="/admin/login">Back to admin login</Link>
      </div>
    </AuthLayout>
  );
}
