'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Button, Alert } from '@/components/ui';
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
 */
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
  }, []);

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

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/risk">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>Onboarding — Risk profile</h1>
        <p className="muted">Step 2 of 3: Set your risk limits and acknowledge the risk disclosure.</p>
      </div>

      <Card title="Risk limits" subtitle="Conservative defaults are pre-filled. Adjust to your comfort level.">
        {success && <Alert variant="success">Risk profile saved! Redirecting to broker setup…</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="input-group">
              <label className="input-label">
                Max daily loss (%)
                <InfoTooltip
                  label="Explain maximum daily loss"
                  content="The maximum percentage of your account balance that may be lost in one trading day. When this limit is reached, new trading activity is blocked until the next permitted trading period. Note: market gaps, slippage, broker execution, and connectivity can affect actual results."
                />
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="20"
                value={maxDailyLossPercent}
                onChange={(e) => setMaxDailyLossPercent(e.target.value)}
                disabled={loading}
                className="input"
              />
            </div>
            <div className="input-group">
              <label className="input-label">
                Max drawdown (%)
                <InfoTooltip
                  label="Explain maximum drawdown"
                  content="The maximum permitted decline from the account's previous highest value. Reaching this threshold activates protective restrictions and may stop automated trading."
                />
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                max="30"
                value={maxDrawdownPercent}
                onChange={(e) => setMaxDrawdownPercent(e.target.value)}
                disabled={loading}
                className="input"
              />
            </div>
            <div className="input-group">
              <label className="input-label">
                Max risk per trade (%)
                <InfoTooltip
                  label="Explain maximum risk per trade"
                  content="The maximum percentage of account equity that may be exposed to loss on one trade based on position size and the planned stop-loss level. Slippage may cause realized loss to differ."
                />
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="10"
                value={maxTradeRiskPercent}
                onChange={(e) => setMaxTradeRiskPercent(e.target.value)}
                disabled={loading}
                className="input"
              />
            </div>
            <div className="input-group">
              <label className="input-label">
                Max open trades
                <InfoTooltip
                  label="Explain maximum open trades"
                  content="The maximum number of positions that may remain open at the same time. Lower limits reduce simultaneous market exposure."
                />
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={maxOpenTrades}
                onChange={(e) => setMaxOpenTrades(e.target.value)}
                disabled={loading}
                className="input"
              />
            </div>
            <div className="input-group">
              <label className="input-label">
                Max leverage
                <InfoTooltip
                  label="Explain maximum leverage"
                  content="The highest leverage the platform may permit when evaluating a trading action. Higher leverage increases both potential gains and potential losses."
                />
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={maxLeverageAllowed}
                onChange={(e) => setMaxLeverageAllowed(e.target.value)}
                disabled={loading}
                className="input"
              />
            </div>
            <div className="input-group">
              <label className="input-label">
                Allowed trading mode
                <InfoTooltip
                  label="Explain allowed trading mode"
                  content="Paper-only uses simulated funds. Semi-auto requires explicit approval before execution. Full auto executes after all safety checks."
                />
              </label>
              <select className="input" value={allowedTradingModes} onChange={(e) => setAllowedTradingModes(e.target.value as AllowedTradingMode)} disabled={loading}>
                <option value="PAPER_ONLY">Paper only — simulated (safest)</option>
                <option value="SEMI_AUTO">Semi-auto — manual approval required</option>
                <option value="FULL_AUTO">Full auto — approved automation executes after all safety checks</option>
              </select>
              <p className="text-sm muted" style={{ marginTop: '0.25rem', marginBottom: 0 }}>
                Paper-only mode is recommended until your broker connection and strategy have been tested.
              </p>
            </div>
          </div>

          <p className="text-sm muted" style={{ marginTop: '0.75rem' }}>
            Lower limits generally reduce exposure but cannot eliminate trading risk.
          </p>

          {/* Risk acknowledgement */}
          <div style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid var(--border, #2a3550)', borderRadius: '8px', background: 'rgba(245,158,11,0.05)' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={riskAcknowledgementAccepted}
                onChange={(e) => setRiskAcknowledgementAccepted(e.target.checked)}
                disabled={loading}
                style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: 'var(--brand, #d97706)' }}
              />
              <span className="text-sm">
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

          <Button type="submit" block size="lg" loading={loading} style={{ marginTop: '1.5rem' }}>
            {loading ? 'Saving…' : 'Save risk profile & continue'}
          </Button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
          <Link href="/onboarding/profile" className="text-sm">← Profile</Link>
          <Link href="/onboarding/broker" className="text-sm">Skip to broker →</Link>
        </div>
      </Card>
    </DashboardShell>
  );
}
