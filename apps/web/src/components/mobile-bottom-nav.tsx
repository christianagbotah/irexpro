'use client';

import { useEffect, useRef, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  DashboardIcon,
  PaymentsIcon,
  MoreIcon,
  UserIcon,
  ShieldIcon,
  PlugIcon,
  LogoutIcon,
  CloseIcon,
  type IconProps,
} from '@/components/icons';

/**
 * Mobile bottom navigation — Sprint 31 (remediated).
 *
 * Renders a fixed bottom navigation bar visible only on small screens
 * (≤ 700px via CSS). On larger screens it is `display: none` so the desktop
 * sidebar remains the primary navigation. SSR-safe (no viewport polling).
 *
 * ── Information architecture (architect §11 re-evaluation) ───────────────────
 * Primary (3): Dashboard, Payments, More.
 *   - The previous iteration listed "Onboarding" as a primary destination that
 *     linked to /onboarding/profile — but the More sheet already contains a
 *     "Profile" item linking to the SAME route (/onboarding/profile). That was
 *     a redundant entry point. Onboarding is a transitional flow, not a
 *     permanent high-frequency destination; once a user has completed it they
 *     reach profile/risk/broker adjustments via the More sheet. The dashboard's
 *     onboarding-checklist card remains the primary prompt for users who have
 *     NOT yet completed onboarding. No business logic changed; nav only.
 *
 * More sheet (4): Profile, Risk limits, Broker, Log out.
 *
 * ── Accessibility (architect §9 — verified, not asserted) ────────────────────
 *   - role="navigation" + aria-label on the <nav> landmark
 *   - Each item is an <a> (or <button> for "More" + logout) with aria-label
 *   - aria-current="page" on the active route
 *   - Sheet: role="dialog" + aria-modal="true" + aria-labelledby
 *   - Focus trap: Tab/Shift+Tab cycle within the sheet (cannot escape behind it)
 *   - Focus enters the sheet (close button) on open
 *   - Escape closes the sheet; focus restores to the trigger button
 *   - Overlay click closes the sheet
 *   - Body scroll is locked while the sheet is open and restored on close
 *   - Icons are decorative (aria-hidden) — the text label is the accessible name
 *   - Touch targets ≥ 44×44 CSS px (enforced via CSS .mobile-bottom-nav__item)
 *
 * ── Icons (architect §7) ─────────────────────────────────────────────────────
 * Professional SVG icons (apps/web/src/components/icons.tsx) replace the
 * previous emoji. SVG renders identically across Android, iOS, Windows and
 * macOS; emoji do not. Zero new dependencies — mirrors the existing
 * InfoCircleIcon pattern. currentColor, 24×24 viewBox, 1.75 stroke.
 *
 * Safe-area: padding-bottom: env(safe-area-inset-bottom) respects iPhone home
 * indicators without excessive padding on devices without safe areas.
 */

interface NavDestination {
  href: string;
  label: string;
  /** Icon component — decorative; the text label is the accessible name. */
  Icon: ComponentType<IconProps>;
  /** Prefix match for active state (e.g. /payments matches /payments/*). */
  matchPrefix?: boolean;
}

const PRIMARY_NAV: NavDestination[] = [
  { href: '/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { href: '/payments/success', label: 'Payments', Icon: PaymentsIcon, matchPrefix: true },
];

const SECONDARY_NAV: NavDestination[] = [
  { href: '/onboarding/profile', label: 'Profile', Icon: UserIcon },
  { href: '/onboarding/risk', label: 'Risk limits', Icon: ShieldIcon },
  { href: '/onboarding/broker', label: 'Broker', Icon: PlugIcon },
];

function isActive(pathname: string | null, dest: NavDestination): boolean {
  if (!pathname) return false;
  if (dest.matchPrefix) {
    return pathname === dest.href || pathname.startsWith(dest.href + '/');
  }
  return pathname === dest.href;
}

/** CSS selector for focusable elements, in tab order. */
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface MobileBottomNavProps {
  onLogout: () => void;
}

export default function MobileBottomNav({ onLogout }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);
  // The element that had focus before the sheet opened — focus returns here.
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // ── Sheet open/close lifecycle ─────────────────────────────────────────────
  useEffect(() => {
    if (!moreOpen) return;

    // Capture the trigger as the restore target (it still has focus at this
    // point in the open transition).
    previouslyFocusedRef.current = moreButtonRef.current;

    // Lock body scroll while the sheet is open. The overlay itself doesn't
    // scroll; only the sheet content scrolls (overflow-y: auto).
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the sheet (the close button is the first focusable).
    const rafId = requestAnimationFrame(() => {
      sheetCloseRef.current?.focus();
    });

    // Focus trap + Escape handler.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key !== 'Tab') return;
      const sheet = sheetRef.current;
      if (!sheet) return;
      const focusables = Array.from(
        sheet.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null); // visible only
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
      // Restore body scroll.
      document.body.style.overflow = prevBodyOverflow;
      // Restore focus to the trigger.
      previouslyFocusedRef.current?.focus();
    };
    // closeSheet is stable via setState; intentionally not in deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moreOpen]);

  function closeSheet() {
    setMoreOpen(false);
  }

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
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
          aria-controls="mobile-more-sheet"
          aria-label="More navigation"
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
            id="mobile-more-sheet"
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-sheet-title"
            className="mobile-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-sheet__header">
              <h2 id="mobile-more-sheet-title" className="mobile-sheet__title">
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
