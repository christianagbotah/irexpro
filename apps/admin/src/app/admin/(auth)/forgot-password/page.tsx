'use client';

import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { AuthLayout, Button, Input, Alert } from '@/components/ui';

export default function AdminForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setSubmitted(true);
    setLoading(false);
  }

  return (
    <AuthLayout title="Forgot password" subtitle="Enter your admin email to receive reset instructions">
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
          <Input label="Email" type="email" placeholder="admin@irexpro.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} required />
          <Button type="submit" block size="lg" loading={loading}>
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      )}
      <div className="auth-links mt-6">
        <Link href="/admin/login">Back to admin login</Link>
      </div>
    </AuthLayout>
  );
}
