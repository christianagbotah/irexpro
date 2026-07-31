export default function AdminPaymentsPage() {
  return (
    <>
      <h1>Payments</h1>
      <div className="card">
        <h2>Payment records</h2>
        <p className="muted">
          Invoices, transactions, and webhook events. Payment truth comes only
          from verified provider webhooks — never from client reports.
        </p>
      </div>
    </>
  );
}
