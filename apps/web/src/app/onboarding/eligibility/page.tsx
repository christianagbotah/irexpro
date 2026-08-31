'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createEligibilityApi } from '@irexpro/api-client/eligibility';
import type {
  EligibilityDisclosureKey,
  EligibilityStatusView,
} from '@irexpro/types/eligibility';
import { Alert, Badge, Button, Card, DashboardShell } from '@/components/ui';
import { useAuth } from '@/context/auth-context';
import { api } from '@/lib/api';
import { mapApiError } from '@/lib/error-mapping';

const eligibilityApi = createEligibilityApi(api);

function statusCopy(status: EligibilityStatusView) {
  switch (status.jurisdictionStatus) {
    case 'ELIGIBLE':
      return {
        variant: 'success' as const,
        label: 'Jurisdiction eligible',
        text: 'Your current jurisdiction has passed the active eligibility policy or an authorised review.',
      };
    case 'REVIEW_REQUIRED':
      return {
        variant: 'warning' as const,
        label: 'Review required',
        text: 'Your jurisdiction requires an authorised review before automated trading can be enabled.',
      };
    case 'INELIGIBLE':
      return {
        variant: 'error' as const,
        label: 'Not eligible',
        text: 'Automated trading cannot be enabled for the jurisdiction currently recorded on your account.',
      };
    default:
      return {
        variant: 'warning' as const,
        label: 'Country required',
        text: 'Complete your trader profile with a valid country code before eligibility can be determined.',
      };
  }
}

export default function EligibilityOnboardingPage() {
  const router = useRouter();
  const { user, logout, restoring } = useAuth();
  const [status, setStatus] = useState<EligibilityStatusView | null>(null);
  const [selected, setSelected] = useState<Set<EligibilityDisclosureKey>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const next = await eligibilityApi.getMyStatus();
      setStatus(next);
      setSelected(new Set());
    } catch (err) {
      setError(mapApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const acceptedKeys = useMemo(
    () => new Set(status?.consents.map((item) => item.key) ?? []),
    [status],
  );

  if (restoring) {
    return <div style={{ padding: '3rem' }}><p className="muted">Restoring session…</p></div>;
  }

  if (!user) {
    return (
      <div style={{ padding: '3rem', maxWidth: '620px', margin: '0 auto' }}>
        <Card title="Not signed in">
          <p className="muted">You need to log in to complete eligibility onboarding.</p>
          <Link href="/login" className="btn btn--primary mt-4" style={{ display: 'inline-block' }}>
            Go to login
          </Link>
        </Card>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!status) return;
    setError(null);
    setMessage(null);

    const missing = status.disclosures.filter((item) => !acceptedKeys.has(item.key));
    if (missing.some((item) => !selected.has(item.key))) {
      setError('Review and accept every outstanding required disclosure before continuing.');
      return;
    }

    if (missing.length === 0) {
      if (status.canProceed) router.push('/onboarding/risk');
      return;
    }

    setSaving(true);
    try {
      const next = await eligibilityApi.acceptDisclosures({
        acceptances: missing.map((item) => ({
          key: item.key,
          version: item.version,
          contentSha256: item.contentSha256,
        })),
      });
      setStatus(next);
      setSelected(new Set());
      if (next.canProceed) {
        setMessage('Eligibility and disclosure evidence recorded. Continuing to risk setup…');
        router.push('/onboarding/risk');
      } else if (next.jurisdictionStatus === 'REVIEW_REQUIRED') {
        setMessage('Your disclosure evidence is recorded. Jurisdiction review is still required.');
      } else {
        setMessage('Your disclosure evidence is recorded. Automated trading remains unavailable.');
      }
    } catch (err) {
      setError(mapApiError(err).message);
    } finally {
      setSaving(false);
    }
  }

  const copy = status ? statusCopy(status) : null;

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/eligibility">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <Badge variant="info">Step 2 of 4</Badge>
        <h1 style={{ margin: 'var(--space-3) 0 var(--space-2)' }}>Eligibility & disclosures</h1>
        <p className="muted" style={{ maxWidth: '760px', lineHeight: 1.65 }}>
          Before automated trading can be enabled, iRexPro verifies the active jurisdiction policy and records immutable evidence that you accepted the exact current risk disclosures.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {message && <Alert variant="success">{message}</Alert>}

      {loading && (
        <Card>
          <p className="muted">Loading current eligibility policy and disclosure evidence…</p>
        </Card>
      )}

      {!loading && !status && (
        <Card>
          <h2 className="card__title">Eligibility unavailable</h2>
          <p className="muted">The platform could not verify a safe eligibility contract. No previous status is being reused.</p>
          <Button type="button" onClick={() => void load()} style={{ marginTop: 'var(--space-4)' }}>
            Retry
          </Button>
        </Card>
      )}

      {status && copy && (
        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div>
                  <p className="eyebrow">Jurisdiction gate</p>
                  <h2 className="card__title">{copy.label}</h2>
                </div>
                <Badge variant={copy.variant}>{status.jurisdictionStatus.replaceAll('_', ' ')}</Badge>
              </div>
              <p className="muted" style={{ lineHeight: 1.6 }}>{copy.text}</p>
              <dl style={{ display: 'grid', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
                <div><strong>Country:</strong> {status.countryCode ?? 'Not provided'}</div>
                <div><strong>Policy:</strong> {status.policyVersion}</div>
                <div><strong>Decision source:</strong> {status.decisionSource.replaceAll('_', ' ')}</div>
                <div><strong>Reason:</strong> {status.reasonCode.replaceAll('_', ' ')}</div>
              </dl>
              {status.jurisdictionStatus === 'MISSING_PROFILE' && (
                <Link href="/onboarding/profile" className="btn btn--secondary" style={{ display: 'inline-block', marginTop: 'var(--space-4)' }}>
                  Update profile
                </Link>
              )}
            </Card>

            <Card>
              <p className="eyebrow">Readiness evidence</p>
              <h2 className="card__title">{status.missingConsentKeys.length === 0 ? 'Disclosures complete' : `${status.missingConsentKeys.length} disclosures outstanding`}</h2>
              <p className="muted" style={{ lineHeight: 1.6 }}>
                Acceptance is versioned and bound to the SHA-256 digest of the exact disclosure copy. A changed disclosure requires fresh consent.
              </p>
              <div style={{ marginTop: 'var(--space-4)' }}>
                <Badge variant={status.canProceed ? 'success' : 'warning'}>
                  {status.canProceed ? 'Eligibility gate complete' : 'Trading gate blocked'}
                </Badge>
              </div>
            </Card>
          </div>

          <Card>
            <h2 className="card__title">Required disclosures</h2>
            <p className="card__subtitle">Read each item carefully. These disclosures do not promise returns and do not bypass the Risk Engine.</p>

            <div style={{ display: 'grid', gap: 'var(--space-4)', marginTop: 'var(--space-5)' }}>
              {status.disclosures.map((item) => {
                const accepted = acceptedKeys.has(item.key);
                const checked = accepted || selected.has(item.key);
                return (
                  <label key={item.key} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: 'var(--space-3)', alignItems: 'start', padding: 'var(--space-4)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', cursor: accepted ? 'default' : 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={accepted || saving || status.jurisdictionStatus === 'INELIGIBLE'}
                      onChange={(event) => {
                        setSelected((current) => {
                          const next = new Set(current);
                          if (event.target.checked) next.add(item.key);
                          else next.delete(item.key);
                          return next;
                        });
                      }}
                      style={{ marginTop: '0.25rem' }}
                    />
                    <span>
                      <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                        <strong>{item.title}</strong>
                        <Badge variant={accepted ? 'success' : 'neutral'}>{accepted ? 'Accepted' : `Version ${item.version}`}</Badge>
                      </span>
                      <span className="muted" style={{ display: 'block', marginTop: 'var(--space-2)', lineHeight: 1.65 }}>{item.body}</span>
                    </span>
                  </label>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-6)' }}>
              {status.jurisdictionStatus !== 'INELIGIBLE' && status.missingConsentKeys.length > 0 && (
                <Button type="submit" size="lg" loading={saving}>
                  {saving ? 'Recording evidence…' : 'Accept required disclosures'}
                </Button>
              )}
              {status.canProceed && (
                <Button type="button" size="lg" onClick={() => router.push('/onboarding/risk')}>
                  Continue to risk setup
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={() => void load()} disabled={saving}>
                Refresh status
              </Button>
            </div>
          </Card>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', marginTop: 'var(--space-4)' }}>
            <Link href="/onboarding/profile" className="text-sm">← Back to profile</Link>
            <span className="muted text-sm">Eligibility must be complete before automated trading can start.</span>
          </div>
        </form>
      )}
    </DashboardShell>
  );
}
