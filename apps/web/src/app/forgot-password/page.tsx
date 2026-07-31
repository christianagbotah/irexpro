'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Sprint 26: backend does NOT yet have POST /auth/forgot-password.
    // We show a safe generic message regardless — do not expose whether
    // the email exists. Backend password reset is the next sprint.
    await new Promise((r) => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <AuthLayout title="Forgot password" subtitle="Enter your email to receive reset instructions">
      {submitted ? (
        <Alert variant="info">
          If an account exists for this email, password reset instructions will be
          sent once password recovery is enabled. This feature will be available in
          the next update.
        </Alert>
      ) : (
        <form onSubmit={handleSubmit}>
          <Alert variant="warning">
            Password recovery is not yet available. This form will be activated once
            the backend endpoint is ready.
          </Alert>
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            required
          />
          <Button type="submit" block size="lg" loading={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <div className="auth-links mt-6">
        Remember your password? <Link href="/login">Back to login</Link>
      </div>
    </AuthLayout>
  );
}
