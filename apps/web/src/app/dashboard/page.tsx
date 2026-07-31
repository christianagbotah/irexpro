export default function DashboardPage() {
  return (
    <main className="page">
      <h1>Dashboard</h1>
      <div className="card">
        <h2>Overview</h2>
        <p className="muted">
          Your trading dashboard will appear here once you connect a broker
          account and start an AI trading session.
        </p>
      </div>
      <div className="card">
        <h2>Broker connection</h2>
        <p className="muted">Connect a regulated broker account to begin.</p>
      </div>
      <div className="card">
        <h2>Subscription</h2>
        <p className="muted">
          Choose a subscription plan to activate AI auto-trading.
        </p>
      </div>
    </main>
  );
}
