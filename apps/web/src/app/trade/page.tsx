'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import {
  Alert,
  Badge,
  Button,
  Card,
  DashboardShell,
  LoadingSpinner,
} from '@/components/ui';
import { formatEnumLabel } from '@irexpro/types';
import {
  loadTraderTerminalStatus,
  type TraderTerminalStatus,
  type TradingSessionStatusView,
} from '@/lib/trader-terminal-status';

function sessionBadgeVariant(
  status: TradingSessionStatusView,
): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'PAUSED') return 'warning';
  if (status === 'SUSPENDED_RISK_LIMIT' || status === 'SUSPENDED_BROKER') return 'error';
  return 'info';
}

function brokerBadgeVariant(
  status: string,
): 'success' | 'warning' | 'error' | 'info' {
  if (status === 'CONNECTED') return 'success';
  if (status === 'CONNECTING') return 'warning';
  if (status === 'ERROR' || status === 'SUSPENDED') return 'error';
  return 'info';
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function TradingWorkspacePage() {
  const { user, logout, restoring } = useAuth();
  const [terminal, setTerminal] = useState<TraderTerminalStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    setLoadingStatus(true);
    setStatusError(null);
    try {
      setTerminal(await loadTraderTerminalStatus());
    } catch {
      // Fail closed: never preserve previously loaded readiness after a refresh
      // failure because broker/risk/session state may have changed meanwhile.
      setTerminal(null);
      setStatusError(
        'Unable to load the current trading status. No trading metrics have been inferred locally.',
      );
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refreshStatus();
  }, [user, refreshStatus]);

  if (restoring) {
    return (
      <div style={{ padding: '3rem' }}>
        <LoadingSpinner text="Restoring session…" />
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '3rem', maxWidth: 620, margin: '0 auto' }}>
        <Card title="Not signed in">
          <p className="muted">You need to log in to access the trading workspace.</p>
          <Link href="/login" className="btn btn--primary mt-4">
            Go to login
          </Link>
        </Card>
      </div>
    );
  }

  const session = terminal?.session ?? null;
  const broker = terminal?.sessionBroker ?? terminal?.primaryBroker ?? null;

  return (
    <DashboardShell
      user={user}
      onLogout={logout}
      activeRoute="/trade"
      title="Trading Workspace"
    >
      <main className="terminal-foundation">
        <section
          className="terminal-foundation__hero"
          aria-labelledby="trading-workspace-title"
        >
          <div>
            <p className="terminal-foundation__eyebrow">Execution workspace</p>
            <h1 id="trading-workspace-title" className="terminal-foundation__title">
              Trading Workspace
            </h1>
            <p className="terminal-foundation__description">
              Live operational readiness from the Risk Engine, trading-session service,
              and sanitized broker connection contract. Financial performance and AI
              metrics remain hidden until their authoritative contracts are connected.
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            loading={loadingStatus}
            disabled={loadingStatus}
            onClick={() => void refreshStatus()}
          >
            {loadingStatus ? 'Refreshing…' : 'Refresh status'}
          </Button>
        </section>

        {statusError && <Alert variant="error">{statusError}</Alert>}

        {loadingStatus && !terminal ? (
          <Card title="Loading operational status" className="mt-4">
            <LoadingSpinner text="Checking risk, session, and broker status…" />
          </Card>
        ) : terminal ? (
          <>
            {session && !terminal.sessionBroker && (
              <Alert variant="warning">
                The active session references a broker connection that is not present in
                the current sanitized broker list. Treat broker execution readiness as
                unresolved until the connection is reconciled.
              </Alert>
            )}

            <section
              aria-label="Trading operational status"
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: 'var(--space-4)',
                marginTop: 'var(--space-6)',
              }}
            >
              <Card title="Risk Engine">
                <div style={{ marginBottom: 'var(--space-4)' }}>
                  <Badge
                    variant={
                      terminal.risk.killSwitchActive
                        ? 'error'
                        : terminal.risk.canTrade
                          ? 'success'
                          : 'warning'
                    }
                  >
                    {terminal.risk.killSwitchActive
                      ? 'Kill switch active'
                      : terminal.risk.canTrade
                        ? 'Risk gate clear'
                        : 'Trading blocked'}
                  </Badge>
                </div>
                <dl style={{ display: 'grid', gap: 'var(--space-2)' }}>
                  <div>
                    <dt className="text-sm muted">Broker gate</dt>
                    <dd>{terminal.risk.brokerConnected ? 'Connected' : 'Not connected'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm muted">Max daily loss</dt>
                    <dd>{terminal.risk.limits.maxDailyLossPercent}%</dd>
                  </div>
                  <div>
                    <dt className="text-sm muted">Max drawdown</dt>
                    <dd>{terminal.risk.limits.maxDrawdownPercent}%</dd>
                  </div>
                  <div>
                    <dt className="text-sm muted">Max open trades</dt>
                    <dd>{terminal.risk.limits.maxOpenTrades}</dd>
                  </div>
                  <div>
                    <dt className="text-sm muted">Max position size</dt>
                    <dd>{terminal.risk.limits.maxPositionSizeLot} lot</dd>
                  </div>
                  <div>
                    <dt className="text-sm muted">Allowed instruments</dt>
                    <dd>
                      {terminal.risk.limits.allowedInstruments === 'ALL'
                        ? 'All configured instruments'
                        : terminal.risk.limits.allowedInstruments.join(', ')}
                    </dd>
                  </div>
                </dl>
                <Link
                  href="/onboarding/risk"
                  className="btn btn--ghost btn--sm mt-4"
                  style={{ display: 'inline-flex' }}
                >
                  Review risk limits
                </Link>
              </Card>

              <Card title="AI Trading Session">
                {session ? (
                  <>
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      <Badge variant={sessionBadgeVariant(session.status)}>
                        {formatEnumLabel(session.status)}
                      </Badge>
                    </div>
                    <dl style={{ display: 'grid', gap: 'var(--space-2)' }}>
                      <div>
                        <dt className="text-sm muted">Started</dt>
                        <dd>{formatTimestamp(session.startedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm muted">Lifecycle source</dt>
                        <dd>Trading session service</dd>
                      </div>
                      <div>
                        <dt className="text-sm muted">Session financial fields</dt>
                        <dd>Not exposed to this browser contract</dd>
                      </div>
                    </dl>
                  </>
                ) : (
                  <>
                    <Badge variant="info">No active session</Badge>
                    <p className="muted mt-4" style={{ lineHeight: 1.6 }}>
                      No active AI trading session was returned by the trading service.
                      Start eligibility remains controlled by onboarding, broker health,
                      and the Risk Engine.
                    </p>
                    <Link
                      href="/dashboard"
                      className="btn btn--ghost btn--sm mt-4"
                      style={{ display: 'inline-flex' }}
                    >
                      Open trading setup
                    </Link>
                  </>
                )}
              </Card>

              <Card title="Broker Health">
                {broker ? (
                  <>
                    <div style={{ marginBottom: 'var(--space-4)' }}>
                      <Badge variant={brokerBadgeVariant(broker.status)}>
                        {formatEnumLabel(broker.status)}
                      </Badge>
                    </div>
                    <dl style={{ display: 'grid', gap: 'var(--space-2)' }}>
                      <div>
                        <dt className="text-sm muted">Broker</dt>
                        <dd>{broker.brokerName}</dd>
                      </div>
                      {broker.displayName && (
                        <div>
                          <dt className="text-sm muted">Account alias</dt>
                          <dd>{broker.displayName}</dd>
                        </div>
                      )}
                      <div>
                        <dt className="text-sm muted">Environment</dt>
                        <dd>{formatEnumLabel(broker.accountType)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm muted">Last health check</dt>
                        <dd>{formatTimestamp(broker.lastHealthCheckAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-sm muted">Live execution enablement</dt>
                        <dd>{broker.liveTradingEnabled ? 'Enabled' : 'Not enabled'}</dd>
                      </div>
                    </dl>
                    {broker.lastErrorMessage && (
                      <div style={{ marginTop: 'var(--space-4)' }}>
                        <Alert variant="warning">
                          The broker connection reports an error state. Review the broker
                          connection before relying on execution readiness.
                        </Alert>
                      </div>
                    )}
                    <Link
                      href="/onboarding/broker"
                      className="btn btn--ghost btn--sm mt-4"
                      style={{ display: 'inline-flex' }}
                    >
                      Review broker connection
                    </Link>
                  </>
                ) : (
                  <>
                    <Badge variant="warning">No broker connection</Badge>
                    <p className="muted mt-4" style={{ lineHeight: 1.6 }}>
                      No sanitized broker connection was returned for this account.
                    </p>
                    <Link
                      href="/onboarding/broker"
                      className="btn btn--ghost btn--sm mt-4"
                      style={{ display: 'inline-flex' }}
                    >
                      Connect broker
                    </Link>
                  </>
                )}
              </Card>
            </section>

            <aside className="terminal-foundation__policy" aria-label="Trading data integrity policy">
              <strong>Authoritative data only</strong>
              <p>
                This view composes existing Risk Engine, trading-session, and broker
                connection APIs. It does not calculate or fabricate balances, P&amp;L,
                positions, AI confidence, market regime, chart candles, or execution
                quality in the browser.
              </p>
            </aside>
          </>
        ) : null}
      </main>
    </DashboardShell>
  );
}
