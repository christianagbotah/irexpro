'use client';

import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import './landing.css';

/**
 * iRexPro public landing page — post-Sprint-31 UI hotfix (Issue A).
 *
 * Redesigned from a bare-bones placeholder into a polished, restrained,
 * enterprise-grade SaaS landing page. Uses ONLY existing routes
 * (/login, /register, /dashboard) — no invented functionality.
 *
 * Design principles:
 *   - centered max-width content container (no content touching viewport edges)
 *   - professional horizontal page gutters + responsive top/bottom spacing
 *   - no horizontal overflow at any viewport
 *   - clean modern fintech/SaaS appearance, balanced whitespace
 *   - consistent border radius and card spacing
 *   - accessible contrast, existing design-system CSS variables
 *   - no emoji, no decorative complexity
 *   - no exaggerated profit claims or guaranteed-return language
 *
 * User state:
 *   - signed-out → "Log in" + "Create account" CTAs
 *   - signed-in → "Go to dashboard" CTA
 */
export default function HomePage() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  return (
    <div className="landing-shell">
      <header className="landing-header">
        <div className="landing-header__inner">
          <div className="landing-header__brand">
            <span className="landing-header__logo-mark">iR</span>
            <span className="landing-header__wordmark">iRexPro</span>
          </div>
          <nav className="landing-header__nav" aria-label="Public navigation">
            {isAuthenticated ? (
              <Link href="/dashboard" className="btn btn--primary btn--sm">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn--ghost btn--sm">
                  Log in
                </Link>
                <Link href="/register" className="btn btn--primary btn--sm">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-hero__inner">
            <h1 className="landing-hero__title">
              AI-driven forex trading with mandatory risk validation
            </h1>
            <p className="landing-hero__subtitle">
              iRexPro connects a supported broker account and routes AI-generated
              trade signals through a non-bypassable risk engine before any order
              reaches execution.
            </p>
            <div className="landing-hero__cta">
              {isAuthenticated ? (
                <Link href="/dashboard" className="btn btn--primary btn--lg">
                  Go to dashboard
                </Link>
              ) : (
                <>
                  <Link href="/register" className="btn btn--primary btn--lg">
                    Create account
                  </Link>
                  <Link href="/login" className="btn btn--secondary btn--lg">
                    Log in
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="landing-features">
          <div className="landing-features__grid">
            <article className="landing-feature">
              <div className="landing-feature__icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l7 2.5v5.5c0 4.3-2.9 7.8-7 9-4.1-1.2-7-4.7-7-9V5.5L12 3z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h2 className="landing-feature__title">Risk-gated execution</h2>
              <p className="landing-feature__body">
                Every signal passes through an 8-step risk pipeline — kill switch,
                daily loss limits, drawdown, position sizing, and mandatory
                stop-loss before any order is placed.
              </p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature__icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 2v6" />
                  <path d="M15 2v6" />
                  <path d="M7 8h10v3a5 5 0 0 1-10 0V8z" />
                  <path d="M12 16v6" />
                </svg>
              </div>
              <h2 className="landing-feature__title">Encrypted broker connectivity</h2>
              <p className="landing-feature__body">
                Connect a supported broker with AES-256-GCM encrypted credentials.
                Paper and live modes are controlled by explicit, audited switches.
              </p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature__icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 3v18h18" />
                  <path d="M7 14l4-4 3 3 5-6" />
                </svg>
              </div>
              <h2 className="landing-feature__title">Transparent audit trail</h2>
              <p className="landing-feature__body">
                Risk decisions and trade execution events are recorded with structured
                rejection reasons and audit metadata for operational traceability.
              </p>
            </article>

            <article className="landing-feature">
              <div className="landing-feature__icon" aria-hidden="true">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="9" rx="1.5" />
                  <rect x="14" y="3" width="7" height="5" rx="1.5" />
                  <rect x="14" y="12" width="7" height="9" rx="1.5" />
                  <rect x="3" y="16" width="7" height="5" rx="1.5" />
                </svg>
              </div>
              <h2 className="landing-feature__title">Account &amp; dashboard access</h2>
              <p className="landing-feature__body">
                Manage your profile, risk configuration, and broker connections from
                a single dashboard. Subscription plans become available after
                account creation.
              </p>
            </article>
          </div>
        </section>

        <section className="landing-cta">
          <div className="landing-cta__inner">
            <h2 className="landing-cta__title">
              {isAuthenticated
                ? 'Return to your trading dashboard'
                : 'Start with paper trading'}
            </h2>
            <p className="landing-cta__subtitle">
              {isAuthenticated
                ? 'Review your onboarding checklist, risk profile, and broker connection.'
                : 'Create an account, complete onboarding, and connect a broker to begin.'}
            </p>
            <Link
              href={isAuthenticated ? '/dashboard' : '/register'}
              className="btn btn--primary btn--lg"
            >
              {isAuthenticated ? 'Go to dashboard' : 'Create account'}
            </Link>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer__inner">
          <span className="landing-footer__brand">iRexPro</span>
          <span className="landing-footer__tagline">
            Global AI forex trading platform
          </span>
        </div>
      </footer>
    </div>
  );
}
