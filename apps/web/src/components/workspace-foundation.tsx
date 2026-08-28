'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { Alert, Card, DashboardShell, LoadingSpinner } from '@/components/ui';

export interface WorkspaceCapability {
  title: string;
  description: string;
}

interface WorkspaceFoundationProps {
  activeRoute: string;
  title: string;
  eyebrow: string;
  description: string;
  capabilities: WorkspaceCapability[];
}

/**
 * Shared foundation for the new trader-terminal routes.
 *
 * Sprint 33 intentionally does NOT invent balances, P&L, chart candles,
 * confidence scores, market regime, signals, positions, or broker state. Each
 * workspace starts with its real information architecture and will be wired to
 * authoritative API contracts in the following slices.
 */
export default function WorkspaceFoundation({
  activeRoute,
  title,
  eyebrow,
  description,
  capabilities,
}: WorkspaceFoundationProps) {
  const { user, logout, restoring } = useAuth();

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
          <p className="muted">You need to log in to access the iRexPro trading workspace.</p>
          <Link href="/login" className="btn btn--primary mt-4">Go to login</Link>
        </Card>
      </div>
    );
  }

  return (
    <DashboardShell
      user={user}
      onLogout={logout}
      activeRoute={activeRoute}
      title={title}
    >
      <main className="terminal-foundation">
        <section className="terminal-foundation__hero" aria-labelledby="workspace-title">
          <div>
            <p className="terminal-foundation__eyebrow">{eyebrow}</p>
            <h1 id="workspace-title" className="terminal-foundation__title">{title}</h1>
            <p className="terminal-foundation__description">{description}</p>
          </div>
          <span className="terminal-foundation__stage">Foundation · Sprint 33</span>
        </section>

        <Alert variant="info">
          This workspace is being connected to authoritative backend contracts. iRexPro will not display fabricated trading metrics, synthetic account values, or invented AI confidence as live data.
        </Alert>

        <section className="terminal-foundation__grid" aria-label={`${title} capability map`}>
          {capabilities.map((capability, index) => (
            <Card key={capability.title} className="terminal-foundation__capability">
              <span className="terminal-foundation__capability-index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h2 className="card__title">{capability.title}</h2>
              <p>{capability.description}</p>
            </Card>
          ))}
        </section>

        <aside className="terminal-foundation__policy" aria-label="Trading data integrity policy">
          <strong>Data integrity policy</strong>
          <p>
            Financial values, model outputs, risk decisions, execution quality, and broker state must come from a verified API source. Simulation and paper-trading data must be identified explicitly at the data-contract level before presentation.
          </p>
        </aside>
      </main>
    </DashboardShell>
  );
}
