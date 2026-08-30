'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEnumLabel } from '@irexpro/types';
import type { StrategyLabScenarioView, StrategyLabView } from '@irexpro/types/strategy-lab';
import { Alert, Badge, Button, Card, DashboardShell, LoadingSpinner } from '@/components/ui';
import { useAuth } from '@/context/auth-context';
import { loadStrategyLab } from '@/lib/strategy-lab';

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function formatRatio(value: number): string {
  return value.toFixed(2);
}

function scenarioLabel(scenario: StrategyLabScenarioView): string {
  return `${scenario.name} · ${formatEnumLabel(scenario.volatility)}`;
}

export default function StrategyLabPage() {
  const { user, logout, restoring } = useAuth();
  const [snapshot, setSnapshot] = useState<StrategyLabView | null>(null);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadStrategyLab();
      setSnapshot(next);
      setSelectedScenarioId((current) =>
        current && next.scenarios.some((scenario) => scenario.id === current)
          ? current
          : next.scenarios[0]?.id ?? null,
      );
    } catch {
      setSnapshot(null);
      setSelectedScenarioId(null);
      setError('Unable to load the verified Strategy Lab dataset. Previously loaded lab state has been cleared.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void refresh();
  }, [user, refresh]);

  const selectedScenario = useMemo(
    () => snapshot?.scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? snapshot?.scenarios[0] ?? null,
    [snapshot, selectedScenarioId],
  );

  const eligibleCount = selectedScenario?.candidates.filter((candidate) => candidate.eligible).length ?? 0;

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
          <p className="muted">You need to log in to open Strategy Lab.</p>
          <Link href="/login" className="btn btn--primary mt-4">Go to login</Link>
        </Card>
      </div>
    );
  }

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/strategy-lab" title="Strategy Lab">
      <main className="terminal-foundation">
        <section className="terminal-foundation__hero" aria-labelledby="strategy-lab-title">
          <div>
            <p className="terminal-foundation__eyebrow">Deterministic strategy research</p>
            <h1 id="strategy-lab-title" className="terminal-foundation__title">Strategy Lab</h1>
            <p className="terminal-foundation__description">
              Compare strategy behavior across versioned historical scenarios with fixed scoring weights, hard risk constraints, and reproducible rankings. This lab is advisory only and has no live execution controls.
            </p>
          </div>
          <Button type="button" variant="secondary" size="sm" loading={loading} disabled={loading} onClick={() => void refresh()}>
            {loading ? 'Verifying…' : 'Verify dataset'}
          </Button>
        </section>

        {error && <Alert variant="error">{error}</Alert>}

        {loading && !snapshot ? (
          <Card title="Loading Strategy Lab" className="mt-4">
            <LoadingSpinner text="Verifying dataset checksum and deterministic scorecards…" />
          </Card>
        ) : snapshot && selectedScenario ? (
          <>
            <section className="mt-4" aria-label="Strategy Lab dataset summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-4)' }}>
              <Card title="Dataset Version">
                <strong style={{ fontSize: '1.35rem' }}>{snapshot.dataset.version}</strong>
                <p className="text-sm muted mt-1">{snapshot.dataset.id}</p>
              </Card>
              <Card title="Methodology">
                <strong style={{ fontSize: '1.35rem' }}>{snapshot.dataset.methodologyVersion}</strong>
                <p className="text-sm muted mt-1">Fixed weighted scorecard</p>
              </Card>
              <Card title="Candidates">
                <strong style={{ fontSize: '1.75rem' }}>{selectedScenario.candidates.length}</strong>
                <p className="text-sm muted mt-1">Compared in this scenario</p>
              </Card>
              <Card title="Constraint-Passing">
                <strong style={{ fontSize: '1.75rem' }}>{eligibleCount}</strong>
                <p className="text-sm muted mt-1">Eligible for recommendation</p>
              </Card>
            </section>

            <section className="mt-4">
              <Card title="Scenario Matrix" subtitle="Switch scenarios without changing the underlying fixture or scoring rules.">
                <div role="group" aria-label="Strategy Lab scenarios" style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                  {snapshot.scenarios.map((scenario) => (
                    <Button
                      key={scenario.id}
                      type="button"
                      size="sm"
                      variant={scenario.id === selectedScenario.id ? 'primary' : 'secondary'}
                      onClick={() => setSelectedScenarioId(scenario.id)}
                    >
                      {scenarioLabel(scenario)}
                    </Button>
                  ))}
                </div>
                <div className="mt-4" style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
                  <Badge variant="info">{formatEnumLabel(selectedScenario.marketRegime)}</Badge>
                  <Badge variant={selectedScenario.volatility === 'HIGH' ? 'warning' : 'info'}>{formatEnumLabel(selectedScenario.volatility)} volatility</Badge>
                  <span className="text-sm muted">{selectedScenario.description}</span>
                </div>
              </Card>
            </section>

            <section className="mt-4">
              <Alert variant="success">
                Recommended for this fixture: <strong>{selectedScenario.recommendation.strategyCode}</strong> — {selectedScenario.recommendation.summary}
              </Alert>
            </section>

            <section className="mt-4" aria-label="Strategy rankings" style={{ display: 'grid', gap: 'var(--space-4)' }}>
              {selectedScenario.candidates.map((candidate) => (
                <Card key={candidate.strategyCode} title={`#${candidate.rank} · ${candidate.name}`} subtitle={`${candidate.strategyCode} · ${candidate.timeframe}`}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                    <div>
                      <span className="text-sm muted">Composite score</span>
                      <div style={{ fontSize: '2rem', fontWeight: 700, lineHeight: 1.1 }}>{candidate.score.toFixed(1)}</div>
                    </div>
                    <Badge variant={candidate.eligible ? 'success' : 'error'}>{candidate.eligible ? 'Constraints passed' : 'Constraint blocked'}</Badge>
                  </div>

                  <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 'var(--space-3)' }}>
                    <div><span className="text-sm muted">Expected return</span><div>{formatPct(candidate.metrics.expectedReturnPct)}</div></div>
                    <div><span className="text-sm muted">Max drawdown</span><div>{formatPct(candidate.metrics.maxDrawdownPct)}</div></div>
                    <div><span className="text-sm muted">Win rate</span><div>{formatPct(candidate.metrics.winRate * 100)}</div></div>
                    <div><span className="text-sm muted">Profit factor</span><div>{formatRatio(candidate.metrics.profitFactor)}</div></div>
                    <div><span className="text-sm muted">Stability</span><div>{formatPct(candidate.metrics.stability * 100)}</div></div>
                    <div><span className="text-sm muted">Exposure</span><div>{formatPct(candidate.metrics.exposurePct)}</div></div>
                  </div>

                  <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-3)' }}>
                    {Object.entries(candidate.scorecard).map(([label, score]) => (
                      <div key={label}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                          <span className="text-sm muted">{formatEnumLabel(label)}</span>
                          <strong className="text-sm">{score.toFixed(1)}</strong>
                        </div>
                        <div aria-hidden="true" style={{ height: 6, borderRadius: 999, background: 'var(--border-subtle)', overflow: 'hidden', marginTop: 6 }}>
                          <div style={{ width: `${score}%`, height: '100%', background: 'var(--brand)' }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 'var(--space-4)' }}>
                    <div>
                      <strong className="text-sm">Hard constraints</strong>
                      <ul className="mt-2" style={{ marginBottom: 0, paddingLeft: '1.2rem' }}>
                        {candidate.constraints.map((constraint) => (
                          <li key={constraint.code} className="text-sm">
                            {constraint.passed ? 'Pass' : 'Blocked'} · {constraint.label} · {constraint.actual} / {constraint.limit}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <strong className="text-sm">Deterministic rationale</strong>
                      <ul className="mt-2" style={{ marginBottom: 0, paddingLeft: '1.2rem' }}>
                        {candidate.rationale.map((item) => <li key={item} className="text-sm">{item}</li>)}
                      </ul>
                    </div>
                    <div>
                      <strong className="text-sm">Trade-offs</strong>
                      <ul className="mt-2" style={{ marginBottom: 0, paddingLeft: '1.2rem' }}>
                        {candidate.tradeoffs.map((item) => <li key={item} className="text-sm">{item}</li>)}
                      </ul>
                    </div>
                  </div>
                </Card>
              ))}
            </section>

            <section className="mt-4">
              <Card title="Provenance & Safety">
                <p className="text-sm"><strong>As of:</strong> {new Date(snapshot.dataset.asOf).toLocaleString()}</p>
                <p className="text-sm" style={{ overflowWrap: 'anywhere' }}><strong>Checksum:</strong> {snapshot.dataset.checksumSha256}</p>
                <p className="text-sm muted mt-2">{snapshot.disclaimer}</p>
              </Card>
            </section>
          </>
        ) : null}
      </main>
    </DashboardShell>
  );
}
