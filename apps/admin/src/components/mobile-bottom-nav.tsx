'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DashboardIcon,
  UsersIcon,
  PlugIcon,
  PaymentsIcon,
  MoreIcon,
  AuditIcon,
  LogoutIcon,
  CloseIcon,
  type IconProps,
} from '@/components/icons';

/**
 * Admin mobile bottom navigation — Sprint 31 (remediated).
 *
 * Primary (5): Dashboard, Users, Brokers, Payments, More.
 * More sheet (3): Subscriptions, Audit log, Log out.
 *
 * Rendered inside the (protected) admin layout so every authenticated admin
 * page inherits it. Hidden above 700px via CSS — the desktop sidebar remains
 * the primary navigation on tablet/desktop.
 *
 * Authorization is unchanged: this component is only rendered when
 * `hasAdminRole` is true (the (protected) layout gates on it). The backend
 * RolesGuard remains the real security boundary.
 *
 * ── Accessibility (architect §9 — verified, not asserted) ────────────────────
 *   - role="navigation" + aria-label on the <nav> landmark
 *   - aria-current="page" on the active route
 *   - Sheet: role="dialog" + aria-modal="true" + aria-labelledby
 *   - Focus trap: Tab/Shift+Tab cycle within the sheet (cannot escape)
 *   - Focus enters the sheet (close button) on open
 *   - Escape closes the sheet; focus restores to the trigger
 *   - Overlay click closes the sheet
 *   - Body scroll locked while open; restored on close
 *   - Icons decorative (aria-hidden); text label is the accessible name
 *   - Touch targets ≥ 44×44 CSS px
 *
 * ── Icons (architect §7) ─────────────────────────────────────────────────────
 * Professional SVG icons (apps/admin/src/components/icons.tsx) replace emoji.
 * Deterministic across Android/iOS/Windows/macOS. Zero new dependencies.
 */

interface NavDestination {
  href: string;
  label: string;
  Icon: ComponentType<IconProps>;
  matchPrefix?: boolean;
}

const PRIMARY_NAV: NavDestination[] = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { href: '/admin/users', label: 'Users', Icon: UsersIcon, matchPrefix: true },
  { href: '/admin/brokers', label: 'Brokers', Icon: PlugIcon, matchPrefix: true },
  { href: '/admin/payments', label: 'Payments', Icon: PaymentsIcon, matchPrefix: true },
];

const SECONDARY_NAV: NavDestination[] = [
  { href: '/admin/account-appeals', label: 'Account reviews', Icon: UsersIcon },
  // Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
  // SubscriptionsModule is retired. The nav item is renamed "Performance Fees"
  // and points to a placeholder route until the dedicated admin view lands.
  { href: '/admin/audit', label: 'Audit log', Icon: AuditIcon },
];

function isActive(pathname: string | null, dest: NavDestination): boolean {
  if (!pathname) return false;
  if (dest.matchPrefix) {
    return pathname === dest.href || pathname.startsWith(dest.href + '/');
  }
  return pathname === dest.href;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface AdminMobileBottomNavProps {
  onLogout: () => void;
}

export default function AdminMobileBottomNav({ onLogout }: AdminMobileBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!moreOpen) return;

    previouslyFocusedRef.current = moreButtonRef.current;

    // Lock body scroll while the sheet is open.
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const rafId = requestAnimationFrame(() => {
      sheetCloseRef.current?.focus();
    });

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setMoreOpen(false);
        return;
      }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !sheet.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      cancelAnimationFrame(rafId);
      document.body.style.overflow = prevBodyOverflow;
      previouslyFocusedRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreOpen]);

  function closeSheet() {
    setMoreOpen(false);
  }

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Admin primary mobile navigation">
        {PRIMARY_NAV.map((dest) => {
          const active = isActive(pathname, dest);
          const { Icon } = dest;
          return (
            <Link
              key={dest.href}
              href={dest.href}
              className={`mobile-bottom-nav__item${active ? ' mobile-bottom-nav__item--active' : ''}`}
              aria-current={active ? 'page' : undefined}
              aria-label={dest.label}
            >
              <span className="mobile-bottom-nav__icon" aria-hidden="true">
                <Icon size={22} />
              </span>
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
          <span className="mobile-bottom-nav__icon" aria-hidden="true">
            <MoreIcon size={22} />
          </span>
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
            ref={sheetRef}
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
                <CloseIcon size={20} />
              </button>
            </div>
            <ul className="mobile-sheet__list">
              {SECONDARY_NAV.map((dest) => {
                const { Icon } = dest;
                return (
                  <li key={dest.href}>
                    <Link
                      href={dest.href}
                      className="mobile-sheet__item"
                      onClick={closeSheet}
                    >
                      <span className="mobile-sheet__item-icon" aria-hidden="true">
                        <Icon size={20} />
                      </span>
                      <span>{dest.label}</span>
                    </Link>
                  </li>
                );
              })}
              <li>
                <button
                  type="button"
                  className="mobile-sheet__item mobile-sheet__item--danger"
                  onClick={() => {
                    closeSheet();
                    onLogout();
                  }}
                >
                  <span className="mobile-sheet__item-icon" aria-hidden="true">
                    <LogoutIcon size={20} />
                  </span>
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
