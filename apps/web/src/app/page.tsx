import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="page">
      <h1>iRexPro</h1>
      <p className="muted">
        Global AI Forex Trading Platform — client/trader web app.
      </p>
      <div className="card">
        <h2>Get started</h2>
        <p>
          <Link href="/login" className="btn">
            Log in
          </Link>
        </p>
        <p className="muted">
          New here? Subscription plans become available after you create an
          account.
        </p>
      </div>
      <div className="card">
        <h2>Dashboard</h2>
        <p>
          <Link href="/dashboard">Go to your trading dashboard →</Link>
        </p>
      </div>
    </main>
  );
}
