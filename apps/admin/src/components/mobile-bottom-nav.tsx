'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Admin mobile bottom navigation — Sprint 31.
 *
 * Mirror of the web MobileBottomNav, tuned for the admin route tree:
 *   Primary (5): Dashboard, Users, Brokers, Payments, More
 *   More sheet:  Subscriptions, Audit, Log out
 *
 * Rendered inside the (protected) admin layout so every authenticated admin
 * page inherits it. Hidden above 700px via CSS — the desktop sidebar remains
 * the primary navigation on tablet/desktop, mirroring the web app and
 * keeping the existing admin shell responsive behaviour intact.
 *
 * Authorization is unchanged: this component is only rendered when
 * `hasAdminRole` is true (the (protected) layout gates on it). The backend
 * RolesGuard remains the real security boundary.
 *
 * Safe-area-aware (env(safe-area-inset-bottom)), touch targets ≥ 44px,
 * SSR-safe (CSS-driven visibility).
 */

interface NavDestination {
  href: string;
  label: string;
  icon: string;
  /** Prefix match for active state (e.g. /admin/users matches /admin/users/*). */
  matchPrefix?: boolean;
}

const PRIMARY_NAV: NavDestination[] = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/admin/users', label: 'Users', icon: '👥', matchPrefix: true },
  { href: '/admin/brokers', label: 'Brokers', icon: '🔌', matchPrefix: true },
  { href: '/admin/payments', label: 'Payments', icon: '💳', matchPrefix: true },
];

const SECONDARY_NAV: NavDestination[] = [
  { href: '/admin/subscriptions', label: 'Subscriptions', icon: '📋' },
  { href: '/admin/audit', label: 'Audit log', icon: '📜' },
];

function isActive(pathname: string | null, dest: NavDestination): boolean {
  if (!pathname) return false;
  if (dest.matchPrefix) {
    return pathname === dest.href || pathname.startsWith(dest.href + '/');
  }
  return pathname === dest.href;
}

interface AdminMobileBottomNavProps {
  onLogout: () => void;
}

export default function AdminMobileBottomNav({ onLogout }: AdminMobileBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);

  // Close the sheet on Escape; move focus into the sheet when it opens.
  // Focus is restored to the More button BEFORE setState so the trigger
  // receives focus while the sheet is still in the DOM.
  useEffect(() => {
    if (!moreOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        moreButtonRef.current?.focus();
        setMoreOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    requestAnimationFrame(() => {
      sheetCloseRef.current?.focus();
    });
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [moreOpen]);

  function closeSheet() {
    moreButtonRef.current?.focus();
    setMoreOpen(false);
  }

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Admin primary mobile navigation">
        {PRIMARY_NAV.map((dest) => {
          const active = isActive(pathname, dest);
          return (
            <Link
              key={dest.href}
              href={dest.href}
              className={`mobile-bottom-nav__item${active ? ' mobile-bottom-nav__item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={dest.label}
            >
              <span className="mobile-bottom-nav__icon" aria-hidden="true">{dest.icon}</span>
              <span className="mobile-bottom-nav__label">{dest.label}</span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          className={`mobile-bottom-nav__item${moreOpen ? ' mobile-bottom-nav__item--active' : ''}`}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          aria-controls="admin-mobile-more-sheet"
          aria-label="More admin navigation"
          onClick={() => setMoreOpen(true)}
        >
          <span className="mobile-bottom-nav__icon" aria-hidden="true">⋯</span>
          <span className="mobile-bottom-nav__label">More</span>
        </button>
      </nav>

      {moreOpen && (
        <div
          className="mobile-sheet-overlay"
          onClick={closeSheet}
          aria-hidden="true"
        >
          <div
            id="admin-mobile-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-mobile-more-sheet-title"
            className="mobile-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-sheet__header">
              <h2 id="admin-mobile-more-sheet-title" className="mobile-sheet__title">
                More
              </h2>
              <button
                ref={sheetCloseRef}
                type="button"
                className="mobile-sheet__close"
                aria-label="Close more navigation"
                onClick={closeSheet}
              >
                ✕
              </button>
            </div>
            <ul className="mobile-sheet__list">
              {SECONDARY_NAV.map((dest) => (
                <li key={dest.href}>
                  <Link
                    href={dest.href}
                    className="mobile-sheet__item"
                    onClick={closeSheet}
                  >
                    <span className="mobile-sheet__item-icon" aria-hidden="true">{dest.icon}</span>
                    <span>{dest.label}</span>
                  </Link>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  className="mobile-sheet__item mobile-sheet__item--danger"
                  onClick={() => {
                    closeSheet();
                    onLogout();
                  }}
                >
                  <span className="mobile-sheet__item-icon" aria-hidden="true">⏻</span>
                  <span>Log out</span>
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
