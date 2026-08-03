'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Button, Input, Alert, Badge } from '@/components/ui';
import { TimezoneSelect } from '@/components/forms/TimezoneSelect';
import { useNotification } from '@/hooks/useNotification';
import { mapApiError } from '@/lib/error-mapping';
import { api } from '@/lib/api';
import type { TradingExperienceLevel } from '@irexpro/types';

/**
 * Onboarding step 1: Profile completion.
 *
 * Collects: firstName, lastName, countryCode, timezone, preferredCurrency,
 * tradingExperienceLevel. Submits via PATCH /users/me. On success, redirects
 * to the next incomplete onboarding step (or dashboard if all done).
 *
 * UX-4: Premium visual redesign — page header + grouped form sections.
 * Business logic, API calls, state management, and notifications unchanged.
 */
export default function OnboardingProfilePage() {
  const router = useRouter();
  const { user, logout, restoring } = useAuth();
  const notify = useNotification();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [timezone, setTimezone] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [tradingExperienceLevel, setTradingExperienceLevel] = useState<TradingExperienceLevel | ''>('');

  useEffect(() => {
    if (user) {
      // Prefill from AuthUser (firstName/lastName come from /auth/me)
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setCountryCode(user.countryCode ?? '');
      // timezone/preferredCurrency/tradingExperienceLevel are not in AuthUser —
      // fetch the full profile via GET /users/me
      api.getMyProfile().then((p: unknown) => {
        const profile = p as { timezone?: string; preferredCurrency?: string; profile?: { tradingExperienceLevel?: TradingExperienceLevel } };
        if (profile.timezone) setTimezone(profile.timezone);
        if (profile.preferredCurrency) setPreferredCurrency(profile.preferredCurrency);
        if (profile.profile?.tradingExperienceLevel) setTradingExperienceLevel(profile.profile.tradingExperienceLevel);
      }).catch((err) => {
        // Silently notify the user — don't block the form (defaults remain editable).
        notify.error(mapApiError(err).message);
      });
    }
  }, [user, notify]);

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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!tradingExperienceLevel) {
      setError('Please select your trading experience level.');
      return;
    }
    setLoading(true);
    try {
      await api.updateMyProfile({
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        countryCode: countryCode.toUpperCase() || undefined,
        timezone: timezone || undefined,
        preferredCurrency: preferredCurrency.toUpperCase() || undefined,
        tradingExperienceLevel,
      });
      setSuccess(true);
      notify.success('Profile updated successfully.');
      // Redirect to the next onboarding step after a short delay
      setTimeout(() => router.push('/onboarding/risk'), 1000);
    } catch (err) {
      notify.error(mapApiError(err).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/profile">
      {/* Premium page header */}
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-2)' }}>
          <Badge variant="info">Step 1 of 3</Badge>
        </div>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>Trader profile</h1>
        <p className="muted" style={{ maxWidth: '640px', lineHeight: 1.6 }}>
          Tell us a little about yourself. Your name, region, and experience level
          personalize the platform and help us suggest sensible risk defaults for the next step.
        </p>
      </div>

      <Card>
        <h2 className="card__title">Profile details</h2>
        <p className="card__subtitle">
          This information is required before you can configure risk limits. All fields can be updated later.
        </p>

        {success && <Alert variant="success">Profile saved! Redirecting to risk setup…</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} className="onboarding-form">
          {/* ── Group 1: Personal information ───────────────────────────────── */}
          <section className="form-section">
            <h3 className="form-section__title">Personal information</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
              <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} placeholder="John" />
              <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} placeholder="Doe" />
            </div>
            <p className="helper-text">Used to personalize communications and account records.</p>
          </section>

          <hr className="form-section__divider" />

          {/* ── Group 2: Regional preferences ───────────────────────────────── */}
          <section className="form-section">
            <h3 className="form-section__title">Regional preferences</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
              <div>
                <Input label="Country code (2 letters)" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} disabled={loading} placeholder="GH" maxLength={2} />
                <p className="helper-text">ISO 3166-1 alpha-2 — e.g. GH, US, GB, NG.</p>
              </div>
              <TimezoneSelect value={timezone} onChange={setTimezone} label="Timezone" disabled={loading} />
              <div>
                <Input label="Preferred currency (3 letters)" value={preferredCurrency} onChange={(e) => setPreferredCurrency(e.target.value)} disabled={loading} placeholder="USD" maxLength={3} />
                <p className="helper-text">ISO 4217 code — e.g. USD, GHS, EUR.</p>
              </div>
            </div>
            <p className="helper-text">Timezone and currency drive market-session display and reporting.</p>
          </section>

          <hr className="form-section__divider" />

          {/* ── Group 3: Trading experience ────────────────────────────────── */}
          <section className="form-section">
            <h3 className="form-section__title">Trading experience</h3>
            <div className="input-group">
              <label className="input-label">Trading experience level</label>
              <select
                className="input"
                value={tradingExperienceLevel}
                onChange={(e) => setTradingExperienceLevel(e.target.value as TradingExperienceLevel)}
                disabled={loading}
                required
              >
                <option value="">Select your experience…</option>
                <option value="BEGINNER">Beginner — new to trading</option>
                <option value="INTERMEDIATE">Intermediate — some trading experience</option>
                <option value="ADVANCED">Advanced — experienced trader</option>
                <option value="PROFESSIONAL">Professional — full-time trader</option>
              </select>
              <p className="helper-text">
                We use this to suggest conservative default risk limits in the next step. You can adjust every limit.
              </p>
            </div>
          </section>

          <div style={{ marginTop: 'var(--space-6)' }}>
            <Button type="submit" size="lg" loading={loading}>
              {loading ? 'Saving…' : 'Save profile & continue'}
            </Button>
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-4)', flexWrap: 'wrap', gap: 'var(--space-2)' }}>
          <Link href="/dashboard" className="text-sm">← Back to dashboard</Link>
          <Link href="/onboarding/risk" className="text-sm">Skip to risk setup →</Link>
        </div>
      </Card>
    </DashboardShell>
  );
}
