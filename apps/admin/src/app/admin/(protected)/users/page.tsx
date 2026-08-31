'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '@/context/auth-context';
import { Card, Badge, Alert, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { formatEnumLabel } from '@irexpro/types';
import type { OnboardingStatus, UserStatus } from '@irexpro/types';
import AdminUserOnboardingModal, {
  OnboardingStatusContent,
  type AdminUserLite,
} from '@/components/admin-user-onboarding-modal';
import AdminAccountAccessControls from '@/components/admin-account-access-controls';

/**
 * Admin users list — Sprint 29 + Sprint 31 responsive + post-Sprint-31 hotfix.
 *
 * Shows all users with onboarding status badges. Admins can click a user card
 * to see their onboarding detail. Broker credentials are NEVER shown.
 *
 * ── Post-Sprint-31 hotfix (Issue B) ────────────────────────────────────────
 * Previously, selecting a user rendered the Onboarding Status detail in a
 * second column beneath/beside the users list. On mobile this meant the
 * detail appeared BENEATH the entire list, forcing the admin to scroll to
 * the bottom of the page to review the selected user.
 *
 * Now: ADAPTIVE presentation sharing one state/fetch.
 *   - Desktop (≥ 701px): side-by-side Users list + Onboarding detail pane
 *     (unchanged — no desktop regression).
 *   - Mobile (≤ 700px): users list; selecting a user opens the Onboarding
 *     Status in an accessible modal/sheet. The users list stays at its
 *     current scroll position; closing the modal restores focus to the
 *     selected card so the admin can immediately pick another user.
 *
 * The onboarding-status CONTENT (OnboardingStatusContent) is shared between
 * the desktop pane and the mobile modal — zero duplication of data
 * presentation. selectedUserId, selectedOnboarding, onboardingLoading, and
 * error are owned by this page and passed as props to both presentations.
 *
 * ── Label humanization (Issue C) ────────────────────────────────────────────
 * user.status, brokerConnectionStatus, and missingSteps are humanized via
 * formatEnumLabel (SUPER_ADMIN → "Super Admin", CONNECTED → "Connected",
 * PROFILE_INCOMPLETE → "Profile Incomplete"). The backend enum values are
 * unchanged; only the rendered label changes.
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
  return formatEnumLabel(level);
}

/** Format the ISO createdAt as a short date (YYYY-MM-DD) for the meta row. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Mobile breakpoint — matches the CSS @media (max-width: 700px). */
const MOBILE_BREAKPOINT = 700;

export default function AdminUsersPage() {
  const { hasAdminRole } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedOnboarding, setSelectedOnboarding] = useState<OnboardingStatus | null>(null);
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Ref to the currently-selected user card, so the mobile modal can restore
  // focus to it after close.
  const selectedCardRef = useRef<HTMLButtonElement | null>(null);

  // Track viewport width to decide desktop-pane vs mobile-modal.
  // SSR-safe: initial state is false (desktop). The effect runs after mount
  // and corrects to the actual viewport. Because Next.js hydrates the client
  // component tree synchronously after the first paint, the effect runs before
  // any user interaction is possible.
  useEffect(() => {
    const update = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

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
      setOnboardingError(null);
      return;
    }
    let cancelled = false;
    setOnboardingLoading(true);
    setOnboardingError(null);
    (async () => {
      try {
        const status = await api.request<OnboardingStatus>(`/admin/users/${selectedUserId}/onboarding-status`);
        if (!cancelled) setSelectedOnboarding(status);
      } catch (err) {
        if (!cancelled) setOnboardingError(err instanceof Error ? err.message : 'Failed to load onboarding status.');
      } finally {
        if (!cancelled) setOnboardingLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedUserId]);

  const handleCloseModal = useCallback(() => {
    setSelectedUserId(null);
  }, []);

  const handleAccountStatusChanged = useCallback((userId: string, status: UserStatus) => {
    setUsers((current) => current.map((user) => (user.id === userId ? { ...user, status } : user)));
  }, []);

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

  const selectedUser: AdminUserLite | null = selectedUserId
    ? (users.find((u) => u.id === selectedUserId) ?? null)
    : null;
  const modalOpen = isMobile && selectedUserId !== null;

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
                    ref={isSelected ? selectedCardRef : undefined}
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
                      <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>
                        {formatEnumLabel(u.status)}
                      </Badge>
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

        {/*
          Desktop side-by-side Onboarding detail pane (≥ 701px).
          Conditionally rendered: on mobile the AdminUserOnboardingModal
          renders instead, so the desktop pane's content is NOT in the DOM
          on mobile (avoids duplicate <strong>Can start trading:</strong>
          that would confuse screen readers and Playwright's .first()).
          (Post-Sprint-31 hotfix Issue B.)
        */}
        {!isMobile && (
          <Card title="Onboarding status" className="admin-users-pane--desktop-only">
            {!selectedUserId ? (
              <EmptyState icon="📋" title="Select a user" description="Tap a user on the left to view their onboarding status." />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <OnboardingStatusContent
                  onboarding={selectedOnboarding}
                  loading={onboardingLoading}
                  error={onboardingError}
                />
                {selectedUser && (
                  <AdminAccountAccessControls
                    key={selectedUser.id}
                    user={selectedUser}
                    onStatusChanged={handleAccountStatusChanged}
                  />
                )}
              </div>
            )}
          </Card>
        )}
      </div>

      {/*
        Mobile onboarding-status modal (≤ 700px). Renders the SAME content as
        the desktop pane, but in an accessible dialog. The users list keeps
        its scroll position; closing restores focus to the selected card.
      */}
      <AdminUserOnboardingModal
        open={modalOpen}
        user={selectedUser}
        onboarding={selectedOnboarding}
        loading={onboardingLoading}
        error={onboardingError}
        onClose={handleCloseModal}
        triggerRef={selectedCardRef}
        accountAccessControls={
          selectedUser ? (
            <AdminAccountAccessControls
              key={selectedUser.id}
              user={selectedUser}
              onStatusChanged={handleAccountStatusChanged}
            />
          ) : null
        }
      />
    </>
  );
}
