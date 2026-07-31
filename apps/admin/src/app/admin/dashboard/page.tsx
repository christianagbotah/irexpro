'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Card, Badge, EmptyState, Alert } from '@/components/ui';

export default function AdminDashboardPage() {
  const { user, loading, restoring, hasAdminRole } = useAuth();

  if (restoring) {
    return <><h1>Admin dashboard</h1><p className="muted">Restoring session…</p></>;
  }

  if (loading && !user) {
    return <><h1>Admin dashboard</h1><p className="muted">Loading…</p></>;
  }

  if (!user) {
    return (
      <>
        <h1>Admin dashboard</h1>
        <Card title="Not signed in">
          <p className="muted">You need to log in with an admin account to view this dashboard.</p>
          <Link href="/admin/login" className="btn btn--primary mt-4" style={{ display: 'inline-block' }}>Go to admin login</Link>
        </Card>
      </>
    );
  }

  if (!hasAdminRole) {
    return (
      <>
        <h1>Access denied</h1>
        <Card title="Insufficient permissions">
          <Alert variant="error">
            Your account does not have an admin role. You are signed in as{' '}
            <code>{user.email}</code> with roles: {user.roles?.join(', ') || 'none'}.
          </Alert>
          <p className="muted">The backend RolesGuard will also reject your requests with 403. Contact a super-admin if you believe this is an error.</p>
        </Card>
      </>
    );
  }

  return (
    <>
      <h1>Admin dashboard</h1>
      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Signed in as <code>{user.email}</code> (status: {user.status})
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__icon">👥</div>
          <div className="stat-card__label">Total Users</div>
          <div className="stat-card__value">—</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon">📋</div>
          <div className="stat-card__label">Active Subscriptions</div>
          <div className="stat-card__value">—</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon">💳</div>
          <div className="stat-card__label">Monthly Revenue</div>
          <div className="stat-card__value">—</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon">🔌</div>
          <div className="stat-card__label">Broker Connections</div>
          <div className="stat-card__value">—</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        <Card title="User Management">
          <EmptyState icon="👥" title="User overview" description="Search, suspend, and manage user accounts. KYC status and risk-disclosure shown per user." />
          <Link href="/admin/users" className="btn btn--secondary btn--sm btn--block">Manage users</Link>
        </Card>
        <Card title="Subscriptions">
          <EmptyState icon="📋" title="Subscription overview" description="View active subscriptions, manage plans and pricing." />
          <Link href="/admin/subscriptions" className="btn btn--secondary btn--sm btn--block">View subscriptions</Link>
        </Card>
        <Card title="Payments">
          <EmptyState icon="💳" title="Payment records" description="Invoices, transactions, and webhook events. Payment truth from verified webhooks only." />
          <Link href="/admin/payments" className="btn btn--secondary btn--sm btn--block">View payments</Link>
        </Card>
        <Card title="Brokers">
          <EmptyState icon="🔌" title="Broker connections" description="User broker connections and health-check status. Credentials are encrypted." />
          <Link href="/admin/brokers" className="btn btn--secondary btn--sm btn--block">View brokers</Link>
        </Card>
        <Card title="Audit Log">
          <EmptyState icon="📜" title="Audit trail" description="Immutable audit records — payment events, HWM updates, admin actions." />
          <Link href="/admin/audit" className="btn btn--secondary btn--sm btn--block">View audit log</Link>
        </Card>
      </div>
    </>
  );
}
