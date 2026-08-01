'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Button, Input, Alert, Badge } from '@/components/ui';
import { api } from '@/lib/api';
import type { TradingExperienceLevel } from '@irexpro/types';

/**
 * Onboarding step 1: Profile completion.
 *
 * Collects: firstName, lastName, countryCode, timezone, preferredCurrency,
 * tradingExperienceLevel. Submits via PATCH /users/me. On success, redirects
 * to the next incomplete onboarding step (or dashboard if all done).
 */
export default function OnboardingProfilePage() {
  const router = useRouter();
  const { user, logout, restoring } = useAuth();
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
      }).catch(() => { /* ignore — user can fill manually */ });
    }
  }, [user]);

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
      // Redirect to the next onboarding step after a short delay
      setTimeout(() => router.push('/onboarding/risk'), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/profile">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>Onboarding — Profile</h1>
        <p className="muted">Step 1 of 3: Complete your trader profile.</p>
      </div>

      <Card title="Profile details" subtitle="This information personalizes your trading experience.">
        {success && <Alert variant="success">Profile saved! Redirecting to risk setup…</Alert>}
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} disabled={loading} placeholder="John" />
            <Input label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} disabled={loading} placeholder="Doe" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input label="Country code (2 letters)" value={countryCode} onChange={(e) => setCountryCode(e.target.value)} disabled={loading} placeholder="GH" maxLength={2} />
            <Input label="Timezone (IANA)" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={loading} placeholder="Africa/Accra" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Input label="Preferred currency (3 letters)" value={preferredCurrency} onChange={(e) => setPreferredCurrency(e.target.value)} disabled={loading} placeholder="USD" maxLength={3} />
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
            </div>
          </div>

          <Button type="submit" block size="lg" loading={loading} style={{ marginTop: '1rem' }}>
            {loading ? 'Saving…' : 'Save profile & continue'}
          </Button>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
          <Link href="/dashboard" className="text-sm">← Back to dashboard</Link>
          <Link href="/onboarding/risk" className="text-sm">Skip to risk setup →</Link>
        </div>
      </Card>
    </DashboardShell>
  );
}
