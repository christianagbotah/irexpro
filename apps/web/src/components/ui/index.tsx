/**
 * Web UI primitives — shared across apps/web pages.
 * Sprint 26: modern enterprise fintech design system.
 * These are simple functional components — no state library needed.
 */

import { ButtonHTMLAttributes, ComponentType, ReactNode } from 'react';
import MobileBottomNav from '@/components/mobile-bottom-nav';
import { DashboardIcon, PaymentsIcon } from '@/components/icons';

// ── Button ───────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', block, loading, children, className = '', ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', size === 'lg' && 'btn--lg', block && 'btn--block', className]
    .filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={rest.disabled || loading} {...rest}>
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}

// ── Input + Label ─────────────────────────────────────────────────────────────
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...rest }: InputProps) {
  const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);
  return (
    <div className="input-group">
      {label && <label htmlFor={inputId} className="input-label">{label}</label>}
      <input id={inputId} className={`input ${className}`} {...rest} />
      {error && <p className="alert alert--error" style={{ marginTop: '0.5rem', marginBottom: 0 }}>{error}</p>}
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────────────────────
interface CardProps { title?: string; subtitle?: string; children: ReactNode; className?: string; }

export function Card({ title, subtitle, children, className = '' }: CardProps) {
  return (
    <div className={`card ${className}`}>
      {title && <h2 className="card__title">{title}</h2>}
      {subtitle && <p className="card__subtitle">{subtitle}</p>}
      {children}
    </div>
  );
}

// ── Alert ────────────────────────────────────────────────────────────────────
type AlertVariant = 'error' | 'success' | 'warning' | 'info';

export function Alert({ variant = 'info', children }: { variant?: AlertVariant; children: ReactNode }) {
  return <div className={`alert alert--${variant}`} role="alert">{children}</div>;
}

// ── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'success' | 'error' | 'warning' | 'info';

export function Badge({ variant = 'info', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

// ── LoadingSpinner ────────────────────────────────────────────────────────────
export function LoadingSpinner({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="text-center" style={{ padding: '2rem' }}>
      <span className="spinner" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--brand)' }} />
      <p className="loading-text mt-4">{text}</p>
    </div>
  );
}

// ── EmptyState ────────────────────────────────────────────────────────────────
export function EmptyState({ icon = '📭', title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <p className="empty-state__title">{title}</p>
      {description && <p className="muted text-sm">{description}</p>}
    </div>
  );
}

// ── AuthLayout (split-screen) ─────────────────────────────────────────────────
interface AuthLayoutProps { title: string; subtitle?: string; children: ReactNode; }

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__brand">
        <div className="auth-layout__brand-content">
          <div className="auth-layout__logo">
            <span className="auth-layout__logo-mark">iR</span>
            iRexPro
          </div>
          <h1 className="auth-layout__headline">AI-Powered Forex Trading Platform</h1>
          <p className="auth-layout__subheadline">
            Connect your regulated broker account and let iRexPro execute AI-driven
            trades autonomously — with mandatory risk validation on every signal.
          </p>
          <ul className="auth-layout__features">
            <li>AI signal generation with risk-gated execution</li>
            <li>High-water-mark performance fee billing</li>
            <li>Secure subscription management</li>
            <li>Encrypted broker credentials (AES-256-GCM)</li>
          </ul>
        </div>
      </div>
      <div className="auth-layout__form-side">
        <div className="auth-layout__form-container">
          <h1 style={{ marginBottom: '0.5rem' }}>{title}</h1>
          {subtitle && <p className="muted" style={{ marginBottom: '1.5rem' }}>{subtitle}</p>}
          {children}
        </div>
      </div>
    </div>
  );
}

// ── DashboardShell ────────────────────────────────────────────────────────────
interface DashboardShellProps {
  user: { email: string | null; firstName?: string | null; lastName?: string | null } | null;
  onLogout: () => void;
  activeRoute?: string;
  children: ReactNode;
}

export function DashboardShell({ user, onLogout, activeRoute, children }: DashboardShellProps) {
  const navItems = [
    { href: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
    { href: '/payments/success', label: 'Payments', Icon: PaymentsIcon },
  ];

  return (
    <div className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <div className="dashboard-sidebar__logo">
          <span className="auth-layout__logo-mark" style={{ width: 36, height: 36, fontSize: '1rem' }}>iR</span>
          iRexPro
        </div>
        <nav className="dashboard-sidebar__nav">
          {navItems.map((item) => {
            const { Icon } = item;
            return (
              <a key={item.href} href={item.href} className={activeRoute === item.href ? 'active' : ''}>
                <span aria-hidden="true"><Icon size={18} /></span> {item.label}
              </a>
            );
          })}
        </nav>
        {user && (
          <div className="dashboard-sidebar__user">
            <p className="text-sm muted" style={{ marginBottom: '0.5rem', wordBreak: 'break-all' }}>
              {user.firstName || user.lastName
                ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()
                : user.email}
            </p>
            <Button variant="ghost" size="sm" block onClick={onLogout}>Log out</Button>
          </div>
        )}
      </aside>
      <div className="dashboard-main">
        <header className="dashboard-header">
          <span className="dashboard-header__title">Dashboard</span>
        </header>
        <div className="dashboard-content">{children}</div>
      </div>
      {/*
        Sprint 31: mobile bottom navigation. Hidden on desktop via CSS
        (.mobile-bottom-nav is display:none above 700px). Rendered here so
        every authenticated page using DashboardShell gets the same mobile
        nav without per-page wiring. The desktop sidebar remains the primary
        navigation on tablet/desktop. Safe-area-aware (env(safe-area-inset-bottom)).
      */}
      <MobileBottomNav onLogout={onLogout} />
    </div>
  );
}
