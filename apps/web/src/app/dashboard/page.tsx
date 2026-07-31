'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';

export default function DashboardPage() {
  const { user, logout, loading, restoring } = useAuth();

  // Sprint 25: show restoring state during session restore
  if (restoring) {
    return (
      <main className="page">
        <h1>Dashboard</h1>
        <p className="muted">Restoring session…</p>
      </main>
    );
  }

  if (loading && !user) {
    return (
      <main className="page">
        <h1>Dashboard</h1>
        <p className="muted">Loading…</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="page">
        <h1>Dashboard</h1>
        <div className="card">
          <h2>Not signed in</h2>
          <p className="muted">
            You need to log in to view your trading dashboard.
          </p>
          <p>
            <Link href="/login" className="btn">
              Go to login
            </Link>
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Dashboard</h1>
      <div className="card">
        <h2>Welcome, {user.email}</h2>
        <p className="muted">
          Status: <code>{user.status}</code>
          {user.countryCode && <> · Country: {user.countryCode}</>}
        </p>
        <p>
          <button
            className="btn"
            type="button"
            onClick={() => logout()}
            disabled={loading}
          >
            {loading ? 'Logging out…' : 'Log out'}
          </button>
        </p>
      </div>
      <div className="card">
        <h2>Broker connection</h2>
        <p className="muted">Connect a regulated broker account to begin AI auto-trading.</p>
      </div>
      <div className="card">
        <h2>Subscription</h2>
        <p className="muted">Choose a subscription plan to activate AI auto-trading.</p>
      </div>
    </main>
  );
}
