/**
 * Admin UI primitives — shared across apps/admin pages.
 * Sprint 26: modern admin/back-office design system with amber accent.
 */

import { ButtonHTMLAttributes, ReactNode } from 'react';

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
  const cls = ['btn', `btn--${variant}`, size === 'sm' && 'btn--sm', size === 'lg' && 'btn--lg', block && 'btn--block', className].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={rest.disabled || loading} {...rest}>
      {loading && <span className="spinner" />}
      {children}
    </button>
  );
}

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
      {error && <div className="alert alert--error" style={{ marginTop: '0.5rem', marginBottom: 0 }}>{error}</div>}
    </div>
  );
}

export function Card({ title, children, className = '' }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`card ${className}`}>
      {title && <h2 className="card__title">{title}</h2>}
      {children}
    </div>
  );
}

type AlertVariant = 'error' | 'success' | 'warning' | 'info';
export function Alert({ variant = 'info', children }: { variant?: AlertVariant; children: ReactNode }) {
  return <div className={`alert alert--${variant}`} role="alert">{children}</div>;
}

type BadgeVariant = 'success' | 'error' | 'warning' | 'info';
export function Badge({ variant = 'info', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

export function EmptyState({ icon = '📭', title, description }: { icon?: string; title: string; description?: string }) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon">{icon}</div>
      <p className="empty-state__title">{title}</p>
      {description && <p className="muted text-sm">{description}</p>}
    </div>
  );
}

interface AuthLayoutProps { title: string; subtitle?: string; children: ReactNode; }

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="auth-layout">
      <div className="auth-layout__brand">
        <div className="auth-layout__brand-content">
          <div className="auth-layout__logo">
            <span className="auth-layout__logo-mark">iR</span>
            iRexPro Admin
          </div>
          <h1 className="auth-layout__headline">Platform Administration Portal</h1>
          <p className="auth-layout__subheadline">
            Manage users, subscriptions, payments, broker connections, and platform
            audit activity. Admin access requires the Admin or Super Admin role.
          </p>
          <ul className="auth-layout__features">
            <li>User management & KYC oversight</li>
            <li>Subscription & payment monitoring</li>
            <li>Broker connection health monitoring</li>
            <li>Immutable audit trail review</li>
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
