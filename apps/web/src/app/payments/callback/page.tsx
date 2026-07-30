'use client';

import { useEffect, useState } from 'react';

type VerifyStatus = 'verifying' | 'success' | 'failed' | 'pending';

/**
 * /payments/callback — Paystack redirects here after a payment attempt.
 *
 * DISPLAY-ONLY. A user landing here does NOT prove the payment succeeded. The
 * only source of truth is the verified Paystack webhook hitting the backend
 * (/api/v1/payments/webhooks/paystack) with HMAC-SHA512 signature verification
 * + amount/currency matching. This page NEVER marks anything as paid.
 */
export default function PaymentCallbackPage() {
  const [status, setStatus] = useState<VerifyStatus>('verifying');
  const [reference, setReference] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('reference') ?? params.get('trxref');
    const paystackStatus = params.get('status');
    if (ref) setReference(ref);

    if (paystackStatus === 'success') {
      setStatus('verifying'); // still verifying — webhook must confirm
    } else if (paystackStatus === 'failed') {
      setStatus('failed');
    } else if (paystackStatus === 'pending' || paystackStatus === 'abandoned') {
      setStatus('pending');
    }
  }, []);

  return (
    <main className="page">
      <h1>Verifying your payment</h1>
      <div className="card">
        <p>
          We are confirming your payment with the payment provider. Your
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
