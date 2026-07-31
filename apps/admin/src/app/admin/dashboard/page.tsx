'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';

export default function AdminDashboardPage() {
  const { user, loading, restoring, hasAdminRole } = useAuth();

  // Sprint 25: show restoring state during session restore
  if (restoring) {
    return (
      <>
        <h1>Admin dashboard</h1>
        <p className="muted">Restoring session…</p>
      </>
    );
  }

  if (loading && !user) {
    return (
      <>
        <h1>Admin dashboard</h1>
        <p className="muted">Loading…</p>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <h1>Admin dashboard</h1>
        <div className="card">
          <h2>Not signed in</h2>
          <p className="muted">
            You need to log in with an admin account to view this dashboard.
          </p>
          <p>
            <Link href="/admin/login" className="btn">
              Go to admin login
            </Link>
          </p>
        </div>
      </>
    );
  }

  // Sprint 25: access denied if signed in but lacks admin role
  if (!hasAdminRole) {
    return (
      <>
        <h1>Access denied</h1>
        <div className="card">
          <h2>Insufficient permissions</h2>
          <p className="error">
            Your account does not have an admin role. You are signed in as{' '}
            <code>{user.email}</code> with roles: {user.roles?.join(', ') || 'none'}.
          </p>
          <p className="muted">
            The backend RolesGuard will also reject your requests to admin
            endpoints with 403. Contact a super-admin if you believe this is an
            error.
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <h1>Admin dashboard</h1>
      <div className="card">
        <h2>Platform overview</h2>
        <p className="muted">
          Signed in as <code>{user.email}</code> (status: {user.status}).
        </p>
        {!hasAdminRole && (
          <p className="error">
            Your account does not appear to have an admin role. Backend admin
            endpoints will return 403. Contact a super-admin if you believe
            this is an error.
          </p>
        )}
      </div>
      <div className="card">
        <h2>Quick links</h2>
        <p className="muted">
          <Link href="/admin/users">Users</Link> ·{' '}
          <Link href="/admin/subscriptions">Subscriptions</Link> ·{' '}
          <Link href="/admin/payments">Payments</Link> ·{' '}
          <Link href="/admin/brokers">Brokers</Link> ·{' '}
          <Link href="/admin/audit">Audit log</Link>
        </p>
      </div>
    </>
  );
}
