'use client';

import { useState, FormEvent, useEffect, KeyboardEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Button, Alert, Badge } from '@/components/ui';
import { InfoTooltip } from '@/components/ui/InfoTooltip';
import { useNotification } from '@/hooks/useNotification';
import { mapApiError } from '@/lib/error-mapping';
import { api } from '@/lib/api';
import type { RiskProfile, AllowedTradingMode } from '@irexpro/types';

/**
 * Onboarding step 2: Risk profile setup.
 *
 * Collects conservative risk limits + mandatory risk acknowledgement.
 * Submits via PATCH /risk/profile. On success, redirects to broker connection.
 *
 * No promotional or fear-based language. Clear warning that trading involves
 * risk and profits are not guaranteed.
 *
 * UX-4: Premium visual redesign — sectioned risk limits + selectable trading
 * mode cards (radiogroup). Business logic, API calls, InfoTooltips, and
 * notifications unchanged.
 */

interface TradingModeOption {
  value: AllowedTradingMode;
  label: string;
  description: string;
}

const TRADING_MODE_OPTIONS: TradingModeOption[] = [
  {
    value: 'PAPER_ONLY',
    label: 'Paper only',
    description: 'Simulated funds. Safest mode — no real capital is at risk.',
  },
  {
    value: 'SEMI_AUTO',
    label: 'Semi-auto',
    description: 'Manual approval is required before each automated execution.',
  },
  {
    value: 'FULL_AUTO',
    label: 'Full auto',
    description: 'Approved automation executes after all safety checks.',
  },
];

export default function OnboardingRiskPage() {
  const router = useRouter();
  const { user, logout, restoring } = useAuth();
  const notify = useNotification();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [maxDailyLossPercent, setMaxDailyLossPercent] = useState('5');
  const [maxDrawdownPercent, setMaxDrawdownPercent] = useState('10');
  const [maxTradeRiskPercent, setMaxTradeRiskPercent] = useState('2');
  const [maxOpenTrades, setMaxOpenTrades] = useState('3');
  const [maxLeverageAllowed, setMaxLeverageAllowed] = useState('30');
  const [allowedTradingModes, setAllowedTradingModes] = useState<AllowedTradingMode>('PAPER_ONLY');
  const [riskAcknowledgementAccepted, setRiskAcknowledgementAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await api.getRiskProfile();
        if (cancelled) return;
        setMaxDailyLossPercent(String(profile.maxDailyLossPercent));
        setMaxDrawdownPercent(String(profile.maxDrawdownPercent));
        setMaxTradeRiskPercent(String(profile.maxTradeRiskPercent));
        setMaxOpenTrades(String(profile.maxOpenTrades));
        setMaxLeverageAllowed(String(profile.maxLeverageAllowed));
        setAllowedTradingModes(profile.allowedTradingModes);
        setRiskAcknowledgementAccepted(profile.riskAcknowledgementAccepted);
      } catch (err) {
        // Profile may not exist yet — defaults are fine, but surface the
        // error silently via a toast so the user knows something went wrong.
        notify.error(mapApiError(err).message);
      } finally {
        if (!cancelled) setFetching(false);
      }
    })();
    return () => { cancelled = true; };
  }, [notify]);

  if (restoring) {
    return <div style={{ padding: '3rem' }}><p className="muted">Restoring session…</p></div>;
  }

  if (!user) {
    return (
      <div style={{ padding: '3rem', maxWidth: '600px', margin: '0 auto' }}>
        <Card title="Not signed in">
          <p className="muted">You need to log in to complete your onboarding.</p>
          <Link href="/login" className="btn btn--primary mt-4" style={{ display: 'inline-block' }}>Go to login</Link>
        </Card>
      </div>
    );
  }

  if (fetching) {
    return (
      <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/risk">
        <Card title="Risk profile"><p className="muted">Loading risk profile…</p></Card>
      </DashboardShell>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!riskAcknowledgementAccepted) {
      setError('You must acknowledge the risk disclosure to continue.');
      notify.warning('Your risk acknowledgement is required.');
      return;
    }
    setLoading(true);
    try {
      await api.updateRiskProfile({
        maxDailyLossPercent: parseFloat(maxDailyLossPercent),
        maxDrawdownPercent: parseFloat(maxDrawdownPercent),
        maxTradeRiskPercent: parseFloat(maxTradeRiskPercent),
        maxOpenTrades: parseInt(maxOpenTrades, 10),
        maxLeverageAllowed: parseInt(maxLeverageAllowed, 10),
        allowedTradingModes,
        riskAcknowledgementAccepted: true,
      });
      setSuccess(true);
      notify.success('Risk limits saved successfully.');
      setTimeout(() => router.push('/onboarding/broker'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save risk profile. Please check your values.');
      notify.error(mapApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  function handleModeKeyDown(e: KeyboardEvent<HTMLDivElement>, mode: AllowedTradingMode) {
    // WAI-ARIA radiogroup pattern:
    //   - Arrow keys move between options AND change the selected value.
    //   - Space/Enter on a focused (but not yet selected) option activates it.
    if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
      e.preventDefault();
      if (!loading) setAllowedTradingModes(mode);
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowLeft') {
      return;
    }
    e.preventDefault();
    const idx = TRADING_MODE_OPTIONS.findIndex((o) => o.value === mode);
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : -1;
    const next = (idx + dir + TRADING_MODE_OPTIONS.length) % TRADING_MODE_OPTIONS.length;
    if (!loading) setAllowedTradingModes(TRADING_MODE_OPTIONS[next].value);
    // Focus the newly selected option for screen-reader feedback.
    const container = e.currentTarget.parentElement;
    if (container) {
      const buttons = container.querySelectorAll<HTMLDivElement>('[role="radio"]');
      buttons[next]?.focus();
    }
  }

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/risk">
      {/* Premium page header — protective tone */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <Badge variant="warning">Step 2 of 3</Badge>
        </div>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>Risk management</h1>
        <p className="muted" style={{ maxWidth: '640px', lineHeight: 1.6 }}>
          These limits protect your account from excessive exposure. Adjust them to match your risk tolerance.
        </p>
      </div>

      <Card>
        <h2 className="card__title">Risk limits</h2>
        <p className="card__subtitle">
          Conservative defaults are pre-filled. Adjust each limit to your comfort level — you can tighten them later.
        </p>

        {success && <Alert variant="success">Risk profile saved! Redirecting to broker setup…</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} className="onboarding-form">
          {/* ── Monetary limits ─────────────────────────────────────────────── */}
          <section className="form-section">
            <h3 className="form-section__title">Monetary limits</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="risk-max-daily-loss">
                  Max daily loss (%)
                  <InfoTooltip
                    label="Explain maximum daily loss"
                    content="The maximum percentage of your account balance that may be lost in one trading day. When this limit is reached, new trading activity is blocked until the next permitted trading period. Note: market gaps, slippage, broker execution, and connectivity can affect actual results."
                  />
                </label>
                <input
                  id="risk-max-daily-loss"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  value={maxDailyLossPercent}
                  onChange={(e) => setMaxDailyLossPercent(e.target.value)}
                  disabled={loading}
                  className="input"
                />
                <p className="helper-text">Range: 0.5% – 20%. Trading pauses when hit.</p>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="risk-max-drawdown">
                  Max drawdown (%)
                  <InfoTooltip
                    label="Explain maximum drawdown"
                    content="The maximum permitted decline from the account's previous highest value. Reaching this threshold activates protective restrictions and may stop automated trading."
                  />
                </label>
                <input
                  id="risk-max-drawdown"
                  type="number"
                  step="0.5"
                  min="1"
                  max="30"
                  value={maxDrawdownPercent}
                  onChange={(e) => setMaxDrawdownPercent(e.target.value)}
                  disabled={loading}
                  className="input"
                />
                <p className="helper-text">Range: 1% – 30%. Activates protective restrictions.</p>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="risk-max-trade-risk">
                  Max risk per trade (%)
                  <InfoTooltip
                    label="Explain maximum risk per trade"
                    content="The maximum percentage of account equity that may be exposed to loss on one trade based on position size and the planned stop-loss level. Slippage may cause realized loss to differ."
                  />
                </label>
                <input
                  id="risk-max-trade-risk"
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="10"
                  value={maxTradeRiskPercent}
                  onChange={(e) => setMaxTradeRiskPercent(e.target.value)}
                  disabled={loading}
                  className="input"
                />
                <p className="helper-text">Range: 0.5% – 10%. Per-position exposure cap.</p>
              </div>
            </div>
          </section>

          <hr className="form-section__divider" />

          {/* ── Exposure limits ─────────────────────────────────────────────── */}
          <section className="form-section">
            <h3 className="form-section__title">Exposure limits</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-4)' }}>
              <div className="input-group">
                <label className="input-label" htmlFor="risk-max-open-trades">
                  Max open trades
                  <InfoTooltip
                    label="Explain maximum open trades"
                    content="The maximum number of positions that may remain open at the same time. Lower limits reduce simultaneous market exposure."
                  />
                </label>
                <input
                  id="risk-max-open-trades"
                  type="number"
                  min="1"
                  max="20"
                  value={maxOpenTrades}
                  onChange={(e) => setMaxOpenTrades(e.target.value)}
                  disabled={loading}
                  className="input"
                />
                <p className="helper-text">Range: 1 – 20 simultaneous positions.</p>
              </div>
              <div className="input-group">
                <label className="input-label" htmlFor="risk-max-leverage">
                  Max leverage
                  <InfoTooltip
                    label="Explain maximum leverage"
                    content="The highest leverage the platform may permit when evaluating a trading action. Higher leverage increases both potential gains and potential losses."
                  />
                </label>
                <input
                  id="risk-max-leverage"
                  type="number"
                  min="1"
                  max="500"
                  value={maxLeverageAllowed}
                  onChange={(e) => setMaxLeverageAllowed(e.target.value)}
                  disabled={loading}
                  className="input"
                />
                <p className="helper-text">Range: 1 – 500. Higher leverage increases both gains and losses.</p>
              </div>
            </div>
          </section>

          <hr className="form-section__divider" />

          {/* ── Trading permissions (selectable cards / radiogroup) ─────────── */}
          <section className="form-section">
            <h3 className="form-section__title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span>Allowed trading mode</span>
              <InfoTooltip
                label="Explain allowed trading mode"
                content="Paper-only uses simulated funds. Semi-auto requires explicit approval before execution. Full auto executes after all safety checks."
              />
            </h3>
            <div
              role="radiogroup"
              aria-label="Allowed trading mode"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-3)' }}
            >
              {TRADING_MODE_OPTIONS.map((option) => {
                const selected = allowedTradingModes === option.value;
                return (
                  <div
                    key={option.value}
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => !loading && setAllowedTradingModes(option.value)}
                    onKeyDown={(e) => handleModeKeyDown(e, option.value)}
                    style={{
                      cursor: loading ? 'not-allowed' : 'pointer',
                      padding: 'var(--space-4)',
                      border: `1px solid ${selected ? 'var(--brand)' : 'var(--border-soft)'}`,
                      borderRadius: 'var(--radius-md)',
                      background: selected
                        ? 'rgba(13, 148, 136, 0.10)'
                        : 'var(--surface-tint)',
                      boxShadow: selected ? 'var(--focus-ring)' : 'none',
                      transition: 'border-color var(--transition-fast), background var(--transition-fast), box-shadow var(--transition-fast)',
                      opacity: loading ? 0.6 : 1,
                      minHeight: '88px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <span
                        aria-hidden="true"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '18px',
                          height: '18px',
                          borderRadius: 'var(--radius-full)',
                          border: `2px solid ${selected ? 'var(--brand)' : 'var(--border-strong)'}`,
                          flexShrink: 0,
                          position: 'relative',
                        }}
                      >
                        {selected && (
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: 'var(--radius-full)',
                              background: 'var(--brand)',
                            }}
                          />
                        )}
                      </span>
                      <strong style={{ fontSize: '0.95rem', color: selected ? 'var(--brand-light)' : 'var(--text)' }}>
                        {option.label}
                      </strong>
                    </div>
                    <p className="helper-text" style={{ margin: 0, paddingLeft: 'var(--space-5)' }}>
                      {option.description}
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="helper-text">
              Paper-only mode is recommended until your broker connection and strategy have been tested.
            </p>
          </section>

          <p className="text-sm muted" style={{ marginTop: 'var(--space-4)' }}>
            Lower limits generally reduce exposure but cannot eliminate trading risk.
          </p>

          {/* ── Risk acknowledgement (warning panel) ────────────────────────── */}
          <div
            className="alert alert--warning"
            style={{
              marginTop: 'var(--space-6)',
              display: 'block',
              padding: 'var(--space-4) var(--space-5)',
              borderLeft: '3px solid var(--warning)',
            }}
          >
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={riskAcknowledgementAccepted}
                onChange={(e) => setRiskAcknowledgementAccepted(e.target.checked)}
                disabled={loading}
                style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--warning)' }}
              />
              <span className="text-sm" style={{ color: 'var(--text)' }}>
                <strong>Risk acknowledgement.</strong>{' '}
                <InfoTooltip
                  label="Explain risk acknowledgement"
                  content="Accepting the risk acknowledgement confirms that you understand trading can result in financial loss and that no result or profit is guaranteed."
                />{' '}
                I understand that trading in financial markets
                involves significant risk of loss. Past performance does not guarantee future results.
                The AI trading system may incur losses, and I am responsible for monitoring my account.
                Profits are not guaranteed. I have reviewed and accept the risk limits configured above.
              </span>
            </label>
          </div>

          <div style={{ marginTop: 'var(--space-6)' }}>
            <Button type="submit" size="lg" loading={loading}>
              {loading ? 'Saving…' : 'Save risk profile & continue'}
            </Button>
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <Link href="/onboarding/profile" className="text-sm">← Profile</Link>
          <Link href="/onboarding/broker" className="text-sm">Skip to broker →</Link>
        </div>
      </Card>
    </DashboardShell>
  );
}
