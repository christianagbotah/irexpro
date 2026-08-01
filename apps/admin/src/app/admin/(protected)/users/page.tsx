'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { Card, Badge, Alert, Button, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import type { OnboardingStatus } from '@irexpro/types';

/**
 * Admin users list — Sprint 29.
 *
 * Shows all users with onboarding status badges:
 *   - Incomplete (profile not done)
 *   - Risk pending (profile done, risk not done)
 *   - Broker pending (profile + risk done, broker not connected)
 *   - Ready (all steps complete + canStartTrading)
 *
 * Admins can click a user to see their onboarding detail. Broker credentials
 * are NEVER shown — the onboarding status only returns boolean flags + status.
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
        // The admin users endpoint returns { users, total }
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Users list */}
        <Card title={`Users (${users.length})`}>
          {users.length === 0 ? (
            <EmptyState icon="👥" title="No users" description="No users have registered yet." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUserId(u.id)}
                  style={{
                    textAlign: 'left',
                    padding: '0.75rem 1rem',
                    border: '1px solid var(--border, #2a3550)',
                    borderRadius: '8px',
                    background: selectedUserId === u.id ? 'rgba(217,119,6,0.1)' : 'transparent',
                    cursor: 'pointer',
                    color: 'inherit',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>{u.profile?.firstName ?? '(no name)'} {u.profile?.lastName ?? ''}</strong>
                      <div className="text-sm muted">{u.email ?? u.phone ?? '(no contact)'}</div>
                    </div>
                    <Badge variant={u.status === 'ACTIVE' ? 'success' : 'warning'}>{u.status}</Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Onboarding detail */}
        <Card title="Onboarding status">
          {!selectedUserId ? (
            <EmptyState icon="📋" title="Select a user" description="Click a user on the left to view their onboarding status." />
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
