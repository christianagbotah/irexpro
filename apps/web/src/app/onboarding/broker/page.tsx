'use client';

import { useState, FormEvent, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { DashboardShell, Card, Button, Input, Alert, Badge, EmptyState } from '@/components/ui';
import { ConfirmDialog } from '@/components/notifications/ConfirmDialog';
import { useNotification } from '@/hooks/useNotification';
import { mapApiError } from '@/lib/error-mapping';
import { api } from '@/lib/api';
import type { SupportedBroker, BrokerConnectionView, BrokerTestResult } from '@irexpro/types';

/**
 * Onboarding step 3: Broker connection.
 *
 * Lists supported brokers (Paper Broker recommended first). Lets the user:
 *   - Enter credentials
 *   - Test credentials (POST /broker/connections/test — no persistence)
 *   - Create connection (POST /broker/connections — encrypts + saves)
 *   - Connect/disconnect existing connections
 *
 * Credentials are NEVER shown after save. The backend response DTO excludes
 * all credential fields.
 */
type BrokerAction = 'testing' | 'saving' | 'connecting' | 'disconnecting' | 'deleting';

export default function OnboardingBrokerPage() {
  const router = useRouter();
  const { user, logout, restoring } = useAuth();
  const notify = useNotification();
  const [action, setAction] = useState<BrokerAction | null>(null);
  const [pendingConnectionId, setPendingConnectionId] = useState<string | null>(null);
  const loading = action !== null;
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => void;
    tone: 'danger' | 'warning';
  }>({
    open: false,
    title: '',
    description: '',
    confirmLabel: '',
    onConfirm: () => {},
    tone: 'danger',
  });

  const [supportedBrokers, setSupportedBrokers] = useState<SupportedBroker[]>([]);
  const [connections, setConnections] = useState<BrokerConnectionView[]>([]);

  const [selectedBrokerId, setSelectedBrokerId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [testResult, setTestResult] = useState<BrokerTestResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [brokers, conns] = await Promise.all([
          api.listSupportedBrokers(),
          api.listBrokerConnections(),
        ]);
        if (cancelled) return;
        setSupportedBrokers(brokers);
        setConnections(conns);
        if (brokers.length > 0) setSelectedBrokerId(brokers[0].brokerId);
      } catch (err) {
        // Silently notify — don't block the page (user can still attempt actions).
        if (!cancelled) notify.error(mapApiError(err).message);
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
      <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/broker">
        <Card title="Broker connection"><p className="muted">Loading broker data…</p></Card>
      </DashboardShell>
    );
  }

  const activeConnection = connections.find((c) => c.status === 'CONNECTED');

  async function handleTest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setTestResult(null);
    if (!selectedBrokerId || !accountId) {
      setError('Please select a broker and enter your account ID.');
      return;
    }
    setAction('testing');
    notify.info('Testing broker credentials...');
    try {
      const result = await api.testBrokerCredentials({
        brokerId: selectedBrokerId,
        accountType: 'DEMO',
        accountId,
        apiKey: apiKey || undefined,
        apiSecret: apiSecret || undefined,
      });
      setTestResult(result);
      if (result.success) {
        notify.success('Broker connection test passed.');
      } else {
        notify.error('The broker connection test failed. Please check your credentials.');
      }
    } catch (err) {
      notify.error('The broker connection test failed. Please check your credentials.');
    } finally {
      setAction(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!selectedBrokerId || !accountId) {
      setError('Please select a broker and enter your account ID.');
      return;
    }
    setAction('saving');
    try {
      await api.createBrokerConnection({
        brokerId: selectedBrokerId,
        accountType: 'DEMO',
        accountId,
        apiKey: apiKey || undefined,
        apiSecret: apiSecret || undefined,
        displayName: displayName || undefined,
      });
      notify.success('Broker connection created.');
      // Clear credential fields — never show them again after save
      setApiKey('');
      setApiSecret('');
      // Refresh connections list
      const conns = await api.listBrokerConnections();
      setConnections(conns);
    } catch (err) {
      notify.error(mapApiError(err).message);
    } finally {
      setAction(null);
    }
  }

  async function handleConnect(connectionId: string) {
    setError(null);
    setAction('connecting');
    setPendingConnectionId(connectionId);
    try {
      await api.connectBroker(connectionId);
      const conns = await api.listBrokerConnections();
      setConnections(conns);
      notify.success('Broker connected.');
    } catch (err) {
      notify.error(mapApiError(err).message);
    } finally {
      setAction(null);
      setPendingConnectionId(null);
    }
  }

  function openDisconnectDialog(connectionId: string) {
    setConfirmDialog({
      open: true,
      title: 'Disconnect broker?',
      description:
        'Automated trading will remain unavailable until a broker is reconnected.',
      confirmLabel: 'Disconnect',
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        void handleDisconnect(connectionId);
      },
      tone: 'danger',
    });
  }

  function openDeleteDialog(connectionId: string) {
    setConfirmDialog({
      open: true,
      title: 'Delete broker connection?',
      description:
        'This will permanently remove the broker connection. This action cannot be undone.',
      confirmLabel: 'Delete',
      onConfirm: () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        void handleDelete(connectionId);
      },
      tone: 'danger',
    });
  }

  async function handleDisconnect(connectionId: string) {
    setError(null);
    setAction('disconnecting');
    setPendingConnectionId(connectionId);
    try {
      await api.disconnectBroker(connectionId);
      const conns = await api.listBrokerConnections();
      setConnections(conns);
      notify.success('Broker disconnected.');
    } catch (err) {
      notify.error(mapApiError(err).message);
    } finally {
      setAction(null);
      setPendingConnectionId(null);
    }
  }

  async function handleDelete(connectionId: string) {
    setError(null);
    setAction('deleting');
    setPendingConnectionId(connectionId);
    try {
      await api.request<void>(`/broker/connections/${connectionId}`, { method: 'DELETE' });
      const conns = await api.listBrokerConnections();
      setConnections(conns);
      notify.success('Broker connection deleted.');
    } catch (err) {
      notify.error(mapApiError(err).message);
    } finally {
      setAction(null);
      setPendingConnectionId(null);
    }
  }

  return (
    <DashboardShell user={user} onLogout={logout} activeRoute="/onboarding/broker">
      <div style={{ marginBottom: '1.5rem' }}>
        <h1>Onboarding — Broker connection</h1>
        <p className="muted">Step 3 of 3: Connect a broker account to enable trading.</p>
      </div>

      {activeConnection && (
        <Alert variant="success">
          ✅ A broker is connected ({activeConnection.brokerName}). Onboarding is complete!
          <Button variant="secondary" size="sm" onClick={() => router.push('/dashboard')} style={{ marginLeft: '1rem' }}>
            Go to dashboard
          </Button>
        </Alert>
      )}

      <Card title="Existing connections" className="mt-4">
        {connections.length === 0 ? (
          <EmptyState icon="🔌" title="No broker connections yet" description="Create your first broker connection below." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {connections.map((conn) => (
              <div key={conn.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', border: '1px solid var(--border, #2a3550)', borderRadius: '8px' }}>
                <div>
                  <strong>{conn.brokerName}</strong>
                  {conn.displayName && <span className="muted"> — {conn.displayName}</span>}
                  <div className="text-sm muted">Account: {conn.accountId ?? '(not set)'}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Badge variant={conn.status === 'CONNECTED' ? 'success' : conn.status === 'ERROR' ? 'error' : 'info'}>
                    {conn.status}
                  </Badge>
                  {conn.status === 'CONNECTED' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openDisconnectDialog(conn.id)}
                      disabled={loading}
                      loading={action === 'disconnecting' && pendingConnectionId === conn.id}
                    >
                      {action === 'disconnecting' && pendingConnectionId === conn.id ? 'Disconnecting…' : 'Disconnect'}
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleConnect(conn.id)}
                      disabled={loading}
                      loading={action === 'connecting' && pendingConnectionId === conn.id}
                    >
                      {action === 'connecting' && pendingConnectionId === conn.id ? 'Connecting…' : 'Connect'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDeleteDialog(conn.id)}
                    disabled={loading}
                    loading={action === 'deleting' && pendingConnectionId === conn.id}
                  >
                    {action === 'deleting' && pendingConnectionId === conn.id ? 'Deleting…' : 'Delete'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Connect a new broker" className="mt-4" subtitle="Paper Broker is recommended for your first connection — it is simulated and safest.">
        {error && <Alert variant="error">{error}</Alert>}

        <form onSubmit={handleCreate}>
          <div className="input-group">
            <label className="input-label">Broker</label>
            <select className="input" value={selectedBrokerId} onChange={(e) => setSelectedBrokerId(e.target.value)} disabled={loading}>
              {supportedBrokers.map((b) => (
                <option key={b.brokerId} value={b.brokerId}>{b.brokerName}</option>
              ))}
            </select>
          </div>
          <Input label="Account ID" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={loading} placeholder="Your broker account ID" required />
          <Input label="Display name (optional)" value={displayName} onChange={(e) => setDisplayName(e.target.value)} disabled={loading} placeholder="My demo account" />
          <Input label="API key (optional for paper broker)" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} disabled={loading} placeholder="••••••••" />
          <Input label="API secret (optional for paper broker)" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} disabled={loading} placeholder="••••••••" />

          {/* Credentials are never shown after save */}
          <Alert variant="info">
            🔒 Credentials are encrypted (AES-256-GCM) before storage. They are NEVER returned in API responses or logs.
          </Alert>

          {testResult && (
            <Alert variant={testResult.success ? 'success' : 'error'}>
              {testResult.success
                ? `✅ Test succeeded! Account ID: ${testResult.accountId ?? '(confirmed)'}`
                : `❌ Test failed: ${testResult.errorMessage ?? 'unknown error'}`}
            </Alert>
          )}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
            <Button
              type="button"
              variant="secondary"
              onClick={handleTest}
              disabled={loading}
              loading={action === 'testing'}
            >
              {action === 'testing' ? 'Testing…' : 'Test credentials'}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={loading}
              loading={action === 'saving'}
            >
              {action === 'saving' ? 'Saving…' : 'Save connection'}
            </Button>
          </div>
        </form>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
          <Link href="/onboarding/risk" className="text-sm">← Risk profile</Link>
          <Link href="/dashboard" className="text-sm">Back to dashboard →</Link>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        description={confirmDialog.description}
        confirmLabel={confirmDialog.confirmLabel}
        tone={confirmDialog.tone}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </DashboardShell>
  );
}
