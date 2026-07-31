'use client';

import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Badge, EmptyState, LoadingSpinner } from '@/components/ui';

export default function DashboardPage() {
  const { user, logout, loading, restoring } = useAuth();

  if (restoring) {
    return <div style={{ padding: '3rem' }}><LoadingSpinner text="Restoring session…" /></div>;
  }

  if (!user) {
    return (
      <div style={{ padding: '3rem', maxWidth: '600px', margin: '0 auto' }}>
        <Card title="Not signed in">
          <p className="muted">You need to log in to view your trading dashboard.</p>
          <a href="/login" className="btn btn--primary mt-4" style={{ display: 'inline-block' }}>Go to login</a>
        </Card>
      </div>
    );
  }

  const fullName = user.firstName || user.lastName ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : user.email;

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/dashboard">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>Dashboard</h1>
        <p className="muted">Welcome back, {fullName}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        <Card title="Account Status">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Badge variant={user.status === 'ACTIVE' ? 'success' : 'warning'}>{user.status}</Badge>
          </div>
          <p className="text-sm muted">Email: {user.email}</p>
          {user.countryCode && <p className="text-sm muted">Country: {user.countryCode}</p>}
          {user.mfaEnabled && <p className="text-sm muted">MFA: Enabled</p>}
        </Card>

        <Card title="Broker Connection">
          <EmptyState icon="🔌" title="No broker connected" description="Connect a regulated broker account to begin AI auto-trading." />
        </Card>

        <Card title="Subscription">
          <EmptyState icon="📋" title="No active subscription" description="Choose a plan to activate AI auto-trading." />
        </Card>
      </div>

      <Card title="Recent Activity" className="mt-6">
        <EmptyState icon="📈" title="No trading activity yet" description="Your AI trading signals and execution history will appear here once you start trading." />
      </Card>
    </DashboardShell>
  );
}
