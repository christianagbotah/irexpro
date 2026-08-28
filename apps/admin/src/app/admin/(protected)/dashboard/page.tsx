'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Card, EmptyState } from '@/components/ui';
import { formatEnumLabel } from '@irexpro/types';

/**
 * Admin dashboard — rendered inside the (protected) layout.
 *
 * Hotfix: the auth/role guard logic (restoring, !user, !hasAdminRole) has been
 * moved to the (protected) layout so every protected admin page inherits it.
 * This page can assume the user is an authenticated admin.
 */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const humanStatus = user?.status ? formatEnumLabel(user.status) : null;

  return (
    <>
      <h1>Admin dashboard</h1>
      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Signed in as <code>{user?.email ?? user?.phone}</code>
        {humanStatus ? <> (status: {humanStatus})</> : null}
      </p>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card__icon">👥</div>
          <div className="stat-card__label">Total Users</div>
          <div className="stat-card__value">—</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__icon">💰</div>
          <div className="stat-card__label">Performance Fee Assessments</div>
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
        <Card title="Performance Fee">
          <EmptyState icon="💰" title="Performance fee overview" description="Performance-fee assessments, invoices, and high-water-mark history. Performance-fee-only model — no subscription required." />

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
