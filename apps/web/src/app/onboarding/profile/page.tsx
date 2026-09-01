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
 * Collects the profile, DOB, and jurisdiction fields required by the
 * server-authoritative readiness contract. The backend independently evaluates
 * adult age and resets KYC whenever a reviewed DOB changes.
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
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [timezone, setTimezone] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [tradingExperienceLevel, setTradingExperienceLevel] = useState<
    TradingExperienceLevel | ''
  >('');

  useEffect(() => {
    if (!user) return;

    setFirstName(user.firstName ?? '');
    setLastName(user.lastName ?? '');
    setCountryCode(user.countryCode ?? '');

    api
      .getMyProfile()
      .then((profileResponse: unknown) => {
        const profile = profileResponse as {
          timezone?: string;
          preferredCurrency?: string;
          profile?: {
            dateOfBirth?: string | null;
            tradingExperienceLevel?: TradingExperienceLevel;
          };
        };
        if (profile.timezone) setTimezone(profile.timezone);
        if (profile.preferredCurrency) setPreferredCurrency(profile.preferredCurrency);
        if (profile.profile?.dateOfBirth) setDateOfBirth(profile.profile.dateOfBirth);
        if (profile.profile?.tradingExperienceLevel) {
          setTradingExperienceLevel(profile.profile.tradingExperienceLevel);
        }
      })
      .catch((requestError) => {
        notify.error(mapApiError(requestError).message);
      });
  }, [user, notify]);

  if (restoring) {
    return (
      <div style={{ padding: '3rem' }}>
        <p className="muted">Restoring session…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={{ padding: '3rem', maxWidth: '600px', margin: '0 auto' }}>
        <Card title="Not signed in">
          <p className="muted">You need to log in to complete your onboarding.</p>
          <Link
            href="/login"
            className="btn btn--primary mt-4"
            style={{ display: 'inline-block' }}
          >
            Go to login
          </Link>
        </Card>
      </div>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!dateOfBirth) {
      setError('Please provide your date of birth.');
      return;
    }
    if (!tradingExperienceLevel) {
      setError('Please select your trading experience level.');
      return;
    }

    setLoading(true);
    try {
      await api.request('/users/me', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: firstName || undefined,
          lastName: lastName || undefined,
          dateOfBirth,
          countryCode: countryCode.toUpperCase() || undefined,
          timezone: timezone || undefined,
          preferredCurrency: preferredCurrency.toUpperCase() || undefined,
          tradingExperienceLevel,
        }),
      });
      setSuccess(true);
      notify.success('Profile updated successfully.');
      setTimeout(() => router.push('/onboarding/eligibility'), 1000);
    } catch (requestError) {
      notify.error(mapApiError(requestError).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/profile">
      <div style={{ marginBottom: 'var(--space-6)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            marginBottom: 'var(--space-2)',
          }}
        >
          <Badge variant="info">Step 1 of 4</Badge>
        </div>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>Trader profile</h1>
        <p className="muted" style={{ maxWidth: '680px', lineHeight: 1.6 }}>
          Complete your profile, date of birth, and jurisdiction details. The next step applies
          independent adult-age, KYC, jurisdiction, and disclosure readiness checks.
        </p>
      </div>

      <Card>
        <h2 className="card__title">Profile details</h2>
        <p className="card__subtitle">
          A changed date of birth invalidates any previous KYC approval and requires a new review.
        </p>

        {success && (
          <Alert variant="success">Profile saved! Redirecting to eligibility review…</Alert>
        )}
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit} className="onboarding-form">
          <section className="form-section">
            <h3 className="form-section__title">Personal information</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <Input
                label="First name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={loading}
                placeholder="John"
              />
              <Input
                label="Last name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={loading}
                placeholder="Doe"
              />
              <Input
                label="Date of birth"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <p className="helper-text">
              Date of birth is evaluated by the server for the adult-age requirement and KYC state.
            </p>
          </section>

          <hr className="form-section__divider" />

          <section className="form-section">
            <h3 className="form-section__title">Regional preferences</h3>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <div>
                <Input
                  label="Country code (2 letters)"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  disabled={loading}
                  placeholder="GH"
                  maxLength={2}
                />
                <p className="helper-text">ISO 3166-1 alpha-2 — e.g. GH, US, GB, NG.</p>
              </div>
              <TimezoneSelect
                value={timezone}
                onChange={setTimezone}
                label="Timezone"
                disabled={loading}
              />
              <div>
                <Input
                  label="Preferred currency (3 letters)"
                  value={preferredCurrency}
                  onChange={(e) => setPreferredCurrency(e.target.value)}
                  disabled={loading}
                  placeholder="USD"
                  maxLength={3}
                />
                <p className="helper-text">ISO 4217 code — e.g. USD, GHS, EUR.</p>
              </div>
            </div>
          </section>

          <hr className="form-section__divider" />

          <section className="form-section">
            <h3 className="form-section__title">Trading experience</h3>
            <div className="input-group">
              <label className="input-label" htmlFor="profile-trading-experience">
                Trading experience level
              </label>
              <select
                id="profile-trading-experience"
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
                This self-reported field does not bypass age, KYC, or jurisdiction controls.
              </p>
            </div>
          </section>

          <div style={{ marginTop: 'var(--space-6)' }}>
            <Button type="submit" size="lg" loading={loading}>
              {loading ? 'Saving…' : 'Save profile & continue'}
            </Button>
          </div>
        </form>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            marginTop: 'var(--space-4)',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
          }}
        >
          <Link href="/dashboard" className="text-sm">
            ← Back to dashboard
          </Link>
          <Link href="/onboarding/eligibility" className="text-sm">
            Continue to eligibility review →
          </Link>
        </div>
      </Card>
    </DashboardShell>
  );
}
