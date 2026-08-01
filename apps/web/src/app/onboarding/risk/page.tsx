'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Button, Input, Alert } from '@/components/ui';
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
      } catch {
        // Profile may not exist yet — defaults are fine
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
      setTimeout(() => router.push('/onboarding/broker'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save risk profile. Please check your values.');
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
            <Input label="Max daily loss (%)" type="number" step="0.5" min="0.5" max="20" value={maxDailyLossPercent} onChange={(e) => setMaxDailyLossPercent(e.target.value)} disabled={loading} />
            <Input label="Max drawdown (%)" type="number" step="0.5" min="1" max="30" value={maxDrawdownPercent} onChange={(e) => setMaxDrawdownPercent(e.target.value)} disabled={loading} />
            <Input label="Max risk per trade (%)" type="number" step="0.5" min="0.5" max="10" value={maxTradeRiskPercent} onChange={(e) => setMaxTradeRiskPercent(e.target.value)} disabled={loading} />
            <Input label="Max open trades" type="number" min="1" max="20" value={maxOpenTrades} onChange={(e) => setMaxOpenTrades(e.target.value)} disabled={loading} />
            <Input label="Max leverage" type="number" min="1" max="500" value={maxLeverageAllowed} onChange={(e) => setMaxLeverageAllowed(e.target.value)} disabled={loading} />
            <div className="input-group">
              <label className="input-label">Allowed trading mode</label>
              <select className="input" value={allowedTradingModes} onChange={(e) => setAllowedTradingModes(e.target.value as AllowedTradingMode)} disabled={loading}>
                <option value="PAPER_ONLY">Paper only — simulated (safest)</option>
                <option value="SEMI_AUTO">Semi-auto — manual approval required</option>
                <option value="FULL_AUTO">Full auto — AI executes automatically</option>
              </select>
            </div>
          </div>

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
                <strong>Risk acknowledgement.</strong> I understand that trading in financial markets
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
