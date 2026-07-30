/**
 * /payments/cancel — Stripe redirects here when the user cancels a checkout
 * session. DISPLAY-ONLY. No payment state changes. No charge was made.
 */
export default function PaymentCancelPage() {
  return (
    <main className="page">
      <h1>Payment cancelled</h1>
      <div className="card">
        <p>No charge was made. You can try again at any time from your dashboard.</p>
        <p className="muted">If you believe this was a mistake, contact support.</p>
      </div>
    </main>
  );
}
