export default function AdminBrokersPage() {
  return (
    <>
      <h1>Brokers</h1>
      <div className="card">
        <h2>Broker connections</h2>
        <p className="muted">
          User broker connections and health-check status. Broker credentials are
          AES-256-GCM encrypted and never exposed in admin views, logs, or audit
          metadata.
        </p>
      </div>
    </>
  );
}
