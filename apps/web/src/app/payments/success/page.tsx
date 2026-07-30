'use client';

import { useEffect, useState } from 'react';

type VerifyStatus = 'verifying' | 'confirmed' | 'failed';

/**
 * /payments/success — Stripe redirects here after a successful checkout session.
 *
 * DISPLAY-ONLY. A user landing here does NOT prove the payment succeeded. The
 * only source of truth is the verified Stripe webhook hitting the backend
 * (/api/v1/payments/webhooks/stripe) with HMAC-SHA256 signature verification +
 * amount/currency matching. This page NEVER marks anything as paid.
 */
export default function PaymentSuccessPage() {
  const [status, setStatus] = useState<VerifyStatus>('verifying');
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session_id');
    if (sessionId) setReference(sessionId);

    // OPTIONAL: poll a read-only backend status endpoint to reflect the
    // webhook-verified state. The frontend must NOT mark anything as paid.
    const interval = setInterval(async () => {
      try {
        // Example (uncomment when the read-only status endpoint exists):
        // const res = await fetch(
        //   `${process.env.NEXT_PUBLIC_API_BASE_URL}/payments/sessions/${sessionId}/status`,
        //   { credentials: 'include' },
        // );
        // if (res.ok) { const data = await res.json(); setStatus(data.verified ? 'confirmed' : 'verifying'); }
      } catch {
        /* keep showing "verifying" — webhook may not have arrived yet */
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="page">
      <h1>Payment received</h1>
      <div className="card">
        <p>
          We are verifying your payment with the payment provider. Your
          subscription will activate once verification completes.
        </p>
        {reference && (
          <p className="muted">
            Reference: <code>{reference}</code>
          </p>
        )}
        <p>Status: {status}…</p>
        <p className="muted">
          You will be redirected to your dashboard once your payment is confirmed.
        </p>
      </div>
    </main>
  );
}
