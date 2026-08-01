'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Badge, EmptyState, LoadingSpinner, Alert } from '@/components/ui';
import { api } from '@/lib/api';
import type { OnboardingStatus } from '@irexpro/types';

/**
 * Web dashboard — Sprint 29.
 *
 * Shows the onboarding checklist card + existing account/subscription/activity
 * cards. The onboarding card fetches GET /users/me/onboarding-status and
 * displays the next step + missing steps with action buttons.
 */
export default function DashboardPage() {
  const { user, logout, loading, restoring } = useAuth();
  const [onboarding, setOnboarding] = useState<OnboardingStatus | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(true);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const status = await api.getOnboardingStatus();
        if (!cancelled) setOnboarding(status);
      } catch (err) {
        if (!cancelled) {
          setOnboardingError(err instanceof Error ? err.message : 'Failed to load onboarding status');
        }
      } finally {
        if (!cancelled) setOnboardingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

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

  const fullName = user.firstName || user.lastName ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() : (user.email ?? user.phone ?? 'Trader');

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/dashboard">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>Dashboard</h1>
        <p className="muted">Welcome back, {fullName}</p>
      </div>

      {/* Sprint 29: Onboarding checklist card */}
      {onboardingLoading ? (
        <Card title="Onboarding checklist" className="mt-4">
          <LoadingSpinner text="Loading onboarding status…" />
        </Card>
      ) : onboarding ? (
        <OnboardingCard status={onboarding} />
      ) : (
        <Card title="Onboarding checklist" className="mt-4">
          <Alert variant="error">{onboardingError ?? 'Unable to load onboarding status.'}</Alert>
        </Card>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        <Card title="Account Status">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <Badge variant={user.status === 'ACTIVE' ? 'success' : 'warning'}>{user.status}</Badge>
          </div>
          <p className="text-sm muted">Email: {user.email ?? '(phone-only)'}</p>
          {user.phone && <p className="text-sm muted">Phone: {user.phone}</p>}
          {user.countryCode && <p className="text-sm muted">Country: {user.countryCode}</p>}
          {user.mfaEnabled && <p className="text-sm muted">MFA: Enabled</p>}
        </Card>

        <Card title="Broker Connection">
          {onboarding?.brokerConnected ? (
            <EmptyState icon="✅" title="Broker connected" description="Your broker account is connected and ready for trading." />
          ) : (
            <EmptyState icon="🔌" title="No broker connected" description="Connect a broker account to begin AI auto-trading." />
          )}
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

/**
 * Onboarding checklist card — shows 4 steps with status + action buttons.
 */
function OnboardingCard({ status }: { status: OnboardingStatus }) {
  const steps = [
    {
      key: 'PROFILE',
      label: 'Complete profile',
      href: '/onboarding/profile',
      done: status.profileCompleted,
      description: 'Set your name, country, timezone, currency, and trading experience.',
    },
    {
      key: 'RISK_PROFILE',
      label: 'Set risk limits',
      href: '/onboarding/risk',
      done: status.riskProfileCompleted,
      description: 'Configure your daily loss limit, max trade risk, and acknowledge the risk disclosure.',
    },
    {
      key: 'BROKER_CONNECTION',
      label: 'Connect broker',
      href: '/onboarding/broker',
      done: status.brokerConnected,
      description: 'Connect a Paper Trading or MetaTrader 5 broker account.',
    },
  ];

  return (
    <Card
      title={status.canStartTrading ? 'Trading setup ready' : 'Complete your onboarding'}
      subtitle={status.canStartTrading
        ? 'All required steps are complete. You can start trading when ready.'
        : 'Complete these steps to start automated trading.'}
      className="mt-4"
    >
      {status.canStartTrading ? (
        <Alert variant="success">
          ✅ Trading setup ready. You can start a trading session from the trading page when you are ready.
        </Alert>
      ) : (
        <Alert variant="info">
          Next step: <strong>{status.nextStep === 'READY' ? 'All complete' : status.nextStep.replace(/_/g, ' ').toLowerCase()}</strong>
        </Alert>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
        {steps.map((step) => (
          <div
            key={step.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0.75rem 1rem',
              border: '1px solid var(--border, #2a3550)',
              borderRadius: '8px',
              background: step.done ? 'rgba(16,185,129,0.05)' : 'transparent',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '1.1rem' }}>{step.done ? '✅' : '⬜'}</span>
                <strong>{step.label}</strong>
                {step.done && <Badge variant="success">Done</Badge>}
              </div>
              <p className="text-sm muted" style={{ margin: 0 }}>{step.description}</p>
            </div>
            {!step.done && (
              <Link href={step.href} className="btn btn--primary btn--sm" style={{ marginLeft: '1rem', flexShrink: 0 }}>
                {status.nextStep === step.key ? 'Start' : 'Complete'}
              </Link>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
