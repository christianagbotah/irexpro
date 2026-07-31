export default function AdminAuditPage() {
  return (
    <>
      <h1>Audit log</h1>
      <div className="card">
        <h2>Platform audit trail</h2>
        <p className="muted">
          Immutable audit records (payment events, subscription activations, HWM
          updates, broker connection changes, admin actions).
        </p>
      </div>
    </>
  );
}
