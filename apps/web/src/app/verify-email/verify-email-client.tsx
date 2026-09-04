'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { consumeSingleUseTokenFragment } from '@/lib/single-use-token-fragment';
import { useAuth } from '@/context/auth-context';
import { Alert, AuthLayout, Button } from '@/components/ui';

interface VerifyEmailClientProps {
  alreadyVerified: boolean;
}

export default function VerifyEmailClient({ alreadyVerified }: VerifyEmailClientProps) {
  const router = useRouter();
  const { user, accessToken, refreshUser } = useAuth();
  const [token, setToken] = useState<string | null | undefined>(
    alreadyVerified ? null : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [verified, setVerified] = useState(alreadyVerified);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (alreadyVerified) return;

    // Fragments are not sent with the initial HTTP navigation request. Read the
    // token only in the browser, retain it only in component memory, and scrub
    // the fragment from the current history entry immediately.
    setToken(consumeSingleUseTokenFragment('/verify-email'));
  }, [alreadyVerified]);

  async function confirm() {
    if (!token || busy || verified) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmEmailVerification(token);
      if (accessToken) {
        await refreshUser().catch(() => {});
      }
      setToken(null);
      setVerified(true);
      router.replace('/verify-email?verified=1');
    } catch {
      // Do not echo provider/backend details or the raw token into the page.
      setError('This verification link is invalid or expired. Sign in and request a new verification email from Account Security.');
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <AuthLayout title="Email verified" subtitle="Your email address has been confirmed successfully.">
        <Alert variant="success">Email verification is complete.</Alert>
        <div style={{ marginTop: '1rem' }}>
          <Link href={user ? '/security' : '/login'} className="btn btn--primary">
            {user ? 'Return to Account Security' : 'Continue to login'}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (token === undefined) {
    return (
      <AuthLayout title="Verify your email">
        <p className="loading-text">Loading verification request…</p>
      </AuthLayout>
    );
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid verification link">
        <Alert variant="error">
          This verification link is missing or invalid. Sign in and request a new verification email from Account Security.
        </Alert>
        <div style={{ marginTop: '1rem' }}>
          <Link href="/login" className="btn btn--primary">Go to login</Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Verify your email" subtitle="Confirm this single-use verification request.">
      {error && <Alert variant="error">{error}</Alert>}
      <Alert variant="info">
        For your security, the verification token is not displayed or stored by this page.
      </Alert>
      <Button type="button" block size="lg" onClick={confirm} loading={busy}>
        {busy ? 'Verifying…' : 'Confirm email'}
      </Button>
      <div className="auth-links" style={{ marginTop: '1rem' }}>
        <Link href="/login">Back to login</Link>
      </div>
    </AuthLayout>
  );
}
