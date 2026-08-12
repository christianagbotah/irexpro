'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Mobile bottom navigation — Sprint 31.
 *
 * Renders a fixed bottom navigation bar that is only visible on small screens
 * (≤ 700px). On larger screens it is `display: none` via CSS so the desktop
 * sidebar remains the primary navigation. This avoids any JS viewport polling
 * and is SSR-safe (no hydration mismatch).
 *
 * Primary destinations (4): Dashboard, Onboarding, Payments, More.
 *   - The destinations are chosen from the *actual* route tree — no invented
 *     routes. /dashboard and /payments/success exist; /onboarding/profile is
 *     the entry point to the onboarding flow (risk/broker follow).
 *
 * "More" opens an accessible bottom Sheet containing secondary destinations:
 *   - Onboarding: Profile / Risk / Broker
 *   - Log out (calls onLogout)
 *
 * Accessibility:
 *   - role="navigation" + aria-label on the <nav> landmark
 *   - Each item is an <a> (or <button> for "More" + logout) with aria-label
 *   - aria-current="page" on the active route
 *   - Sheet uses role="dialog" + aria-modal="true" + aria-labelledby
 *   - Escape closes the sheet; focus returns to the trigger button
 *   - Touch targets are ≥ 44×44 CSS px (enforced via CSS `.mobile-bottom-nav__item`)
 *
 * Safe-area: the bar uses padding-bottom: env(safe-area-inset-bottom) so it
 * respects iPhone home indicators without introducing excessive padding on
 * devices without safe areas.
 *
 * No new dependencies. No business logic. The onLogout prop is the same
 * callback the desktop sidebar uses (passed through from DashboardShell).
 */

interface NavDestination {
  href: string;
  label: string;
  icon: string;
  /** Prefix match for active state (e.g. /onboarding matches /onboarding/*). */
  matchPrefix?: boolean;
}

const PRIMARY_NAV: NavDestination[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/onboarding/profile', label: 'Onboarding', icon: '🧭', matchPrefix: true },
  { href: '/payments/success', label: 'Payments', icon: '💳', matchPrefix: true },
];

const SECONDARY_NAV: NavDestination[] = [
  { href: '/onboarding/profile', label: 'Profile', icon: '👤' },
  { href: '/onboarding/risk', label: 'Risk limits', icon: '🛡️' },
  { href: '/onboarding/broker', label: 'Broker', icon: '🔌' },
];

function isActive(pathname: string | null, dest: NavDestination): boolean {
  if (!pathname) return false;
  if (dest.matchPrefix) {
    // /onboarding/profile is the prefix for /onboarding/*
    const base = dest.href.split('/').slice(0, -1).join('/') || dest.href;
    return pathname === dest.href || pathname.startsWith(base + '/');
  }
  return pathname === dest.href;
}

interface MobileBottomNavProps {
  onLogout: () => void;
}

export default function MobileBottomNav({ onLogout }: MobileBottomNavProps) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const sheetCloseRef = useRef<HTMLButtonElement | null>(null);

  // Close the sheet on Escape; restore focus to the trigger button.
  // Focus is restored BEFORE setState so the trigger receives focus while
  // the sheet is still in the DOM (the cleanup then unmounts it after the
  // re-render). This avoids a race where focus would be lost when the sheet
  // unmounts before the trigger receives focus.
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
    // Move focus into the sheet when it opens.
    requestAnimationFrame(() => {
      sheetCloseRef.current?.focus();
    });
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [moreOpen]);

  // Restore focus to the More button when the sheet closes via overlay click
  // or item selection.
  function closeSheet() {
    moreButtonRef.current?.focus();
    setMoreOpen(false);
  }

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
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
          aria-controls="mobile-more-sheet"
          aria-label="More navigation"
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
            id="mobile-more-sheet"
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
