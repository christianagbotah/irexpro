'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { Card, Badge, Alert, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import type { OnboardingStatus } from '@irexpro/types';

/**
 * Admin users list — Sprint 29 + Sprint 31 responsive hardening.
 *
 * Shows all users with onboarding status badges.
 * Admins can click a user card to see their onboarding detail.
 * Broker credentials are NEVER shown.
 *
 * ── Sprint 31 responsive transformation ────────────────────────────────────
 * Previously the users list rendered a 2-column grid (`gridTemplateColumns:
 * '1fr 1fr'`) of inline-styled buttons that did NOT collapse on mobile,
 * producing cramped two-column rows on phones.
 *
 * The page now uses:
 *   - `.admin-users-grid` (1fr 1fr on desktop, 1fr on mobile via @media)
 *   - `.admin-user-card` structured cards with: identity (name + contact),
 *     meta row (country / trading experience / created date), status badge.
 *
 * The whole card remains the clickable trigger (preserving the existing
 * selection semantics). All data, API calls, and authorization unchanged.
 *
 * On mobile (< 700px) the grid collapses to a single column and each card
 * spans the full viewport width with a clear hierarchy:
 *   identity → contact → meta → status
 */
interface AdminUser {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  countryCode: string | null;
  createdAt: string;
  profile: {
    firstName: string | null;
    lastName: string | null;
    tradingExperienceLevel: string | null;
  } | null;
}

/** Human-readable label for the tradingExperienceLevel enum (or null). */
function experienceLabel(level: string | null): string | null {
  if (!level) return null;
  // The backend enum is BEGINNER / INTERMEDIATE / ADVANCED / EXPERT — surface
  // a friendlier label without changing the underlying value.
  const map: Record<string, string> = {
    BEGINNER: 'Beginner',
    INTERMEDIATE: 'Intermediate',
    ADVANCED: 'Advanced',
    EXPERT: 'Expert',
  };
  return map[level] ?? level;
}

/** Format the ISO createdAt as a short date (YYYY-MM-DD) for the meta row. */
function formatDate(iso: string): string {
  // Defensive: if the backend returns a non-ISO string, show it as-is.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // YYYY-MM-DD — locale-independent, sortable, short.
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminUsersPage() {
  const { hasAdminRole } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedOnboarding, setSelectedOnboarding] = useState<OnboardingStatus | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);

  useEffect(() => {
    if (!hasAdminRole) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await api.request<{ users: AdminUser[]; total: number }>('/admin/users?limit=50');
        if (!cancelled) setUsers(result.users);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load users.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [hasAdminRole]);

  useEffect(() => {
    if (!selectedUserId) {
      setSelectedOnboarding(null);
      return;
    }
    let cancelled = false;
    setOnboardingLoading(true);
    (async () => {
      try {
        const status = await api.request<OnboardingStatus>(`/admin/users/${selectedUserId}/onboarding-status`);
        if (!cancelled) setSelectedOnboarding(status);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load onboarding status.');
      } finally {
        if (!cancelled) setOnboardingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedUserId]);

  if (!hasAdminRole) {
    return (
      <>
        <h1>Access denied</h1>
        <Card title="Insufficient permissions">
          <Alert variant="error">Your account does not have admin access.</Alert>
        </Card>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <h1>Users</h1>
        <Card><p className="muted">Loading users…</p></Card>
      </>
    );
  }

  return (
    <>
      <h1>Users</h1>
      <p className="muted" style={{ marginBottom: '1.5rem' }}>
        Manage user accounts and view onboarding status. Broker credentials are never shown.
      </p>

      {error && <Alert variant="error">{error}</Alert>}

      {/* Sprint 31: responsive grid — 1fr 1fr on desktop, 1fr on mobile.
          The .admin-users-grid class encapsulates the breakpoint so the page
          doesn't need inline media-query logic. */}
      <div className="admin-users-grid">
        <Card title={`Users (${users.length})`}>
          {users.length === 0 ? (
            <EmptyState icon="👥" title="No users" description="No users have registered yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {users.map((u) => {
                const isSelected = selectedUserId === u.id;
                const displayName = u.profile?.firstName ?? '(no name)';
                const displayContact = u.email ?? u.phone ?? '(no contact)';
                const exp = experienceLabel(u.profile?.tradingExperienceLevel ?? null);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUserId(u.id)}
                    className={`admin-user-card${isSelected ? ' admin-user-card--selected' : ''}`}
                    aria-pressed={isSelected}
                    aria-label={`View onboarding status for ${displayName} (${displayContact})`}
                  >
                    {/* Header: identity (left) + status badge (right) */}
                    <div className="admin-user-card__header">
                      <div className="admin-user-card__identity">
                        <div className="admin-user-card__name break-long">
                          {displayName} {u.profile?.lastName ?? ''}
                        </div>
                        <div className="admin-user-card__contact break-long">
                          {displayContact}
                        </div>
                      </div>
                      <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>{u.status}</Badge>
                    </div>
                    {/* Meta row: country / trading experience / created date.
                        Only render the items that have data — no empty chips. */}
                    {(u.countryCode || exp || u.createdAt) && (
                      <div className="admin-user-card__meta">
                        {u.countryCode && (
                          <span className="admin-user-card__meta-item">
                            <span className="admin-user-card__meta-label">Country:</span>{' '}
                            <span>{u.countryCode}</span>
                          </span>
                        )}
                        {exp && (
                          <span className="admin-user-card__meta-item">
                            <span className="admin-user-card__meta-label">Experience:</span>{' '}
                            <span>{exp}</span>
                          </span>
                        )}
                        {u.createdAt && (
                          <span className="admin-user-card__meta-item">
                            <span className="admin-user-card__meta-label">Joined:</span>{' '}
                            <span>{formatDate(u.createdAt)}</span>
                          </span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </Card>

        <Card title="Onboarding status">
          {!selectedUserId ? (
            <EmptyState icon="📋" title="Select a user" description="Tap a user on the left to view their onboarding status." />
          ) : onboardingLoading ? (
            <p className="muted">Loading onboarding status…</p>
          ) : selectedOnboarding ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <strong>Can start trading:</strong>
                <Badge variant={selectedOnboarding.canStartTrading ? 'success' : 'warning'}>
                  {selectedOnboarding.canStartTrading ? 'Yes' : 'No'}
                </Badge>
              </div>
              <OnboardingStep label="Profile complete" done={selectedOnboarding.profileCompleted} />
              <OnboardingStep label="Risk profile complete" done={selectedOnboarding.riskProfileCompleted} />
              <OnboardingStep label="Broker connected" done={selectedOnboarding.brokerConnected} />
              {selectedOnboarding.brokerConnected && (
                <div className="text-sm muted">
                  Broker status: <Badge variant="info">{selectedOnboarding.brokerConnectionStatus}</Badge>
                </div>
              )}
              {selectedOnboarding.missingSteps.length > 0 && (
                <Alert variant="warning">
                  Missing steps: {selectedOnboarding.missingSteps.join(', ')}
                </Alert>
              )}
              {selectedOnboarding.canStartTrading && (
                <Alert variant="success">This user has completed all onboarding steps and can start trading.</Alert>
              )}
            </div>
          ) : (
            <Alert variant="error">Failed to load onboarding status.</Alert>
          )}
        </Card>
      </div>
    </>
  );
}

function OnboardingStep({ label, done }: { label: string; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <span>{done ? '✅' : '⬜'}</span>
      <span>{label}</span>
      <Badge variant={done ? 'success' : 'warning'}>{done ? 'Done' : 'Pending'}</Badge>
    </div>
  );
}
