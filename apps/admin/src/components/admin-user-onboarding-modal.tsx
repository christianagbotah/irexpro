'use client';

import { useEffect, useRef } from 'react';
import { Alert, Badge } from '@/components/ui';
import { CloseIcon } from '@/components/icons';
import { formatEnumLabel } from '@irexpro/types';
import type { OnboardingStatus } from '@irexpro/types';

/**
 * Mobile onboarding-status modal/sheet for the Admin Users page.
 *
 * Post-Sprint-31 hotfix (Issue B): on mobile, selecting a user previously
 * rendered the onboarding-status detail BENEATH the entire users list,
 * forcing the admin to scroll to the bottom of the page to review details.
 *
 * This component renders the SAME onboarding-status content as the desktop
 * side-pane, but inside an accessible modal dialog on mobile. The desktop
 * layout is unchanged (side-by-side Users list + Onboarding pane).
 *
 * ── Architecture (shared state, no duplicated data fetching) ────────────────
 * The parent AdminUsersPage owns:
 *   - selectedUserId
 *   - selectedOnboarding (the fetched OnboardingStatus)
 *   - onboardingLoading
 *   - the selected AdminUser record (for the modal header)
 *
 * This modal receives those as props and renders them. No duplicate API
 * calls, no duplicate authorization checks. The parent passes a `close`
 * callback that clears `selectedUserId`.
 *
 * ── Scroll position preservation (architect §8) ─────────────────────────────
 * Opening the modal does NOT navigate or modify the users-list DOM. The
 * modal is a fixed-position overlay (`position: fixed; inset: 0`), so the
 * underlying users page keeps its scroll position. Body scroll is locked
 * while open and restored on close. Closing returns focus to the trigger
 * card (the selected user's `.admin-user-card`).
 *
 * ── Accessibility (architect §7) ─────────────────────────────────────────────
 * Reuses the Sprint-31 focus-trap + scroll-lock pattern from the mobile
 * bottom nav:
 *   - role="dialog" + aria-modal="true" + aria-labelledby
 *   - Focus enters the modal (close button) on open
 *   - Tab/Shift+Tab cycle within the modal (cannot escape behind overlay)
 *   - Escape closes; focus restores to the trigger card
 *   - Overlay click closes
 *   - Body scroll locked (overflow: hidden) while open; restored on close
 *
 * The modal is ONLY rendered at mobile widths (≤ 700px) — the parent passes
 * `open` based on whether a user is selected AND the viewport is mobile. The
 * desktop layout uses the side-by-side pane instead.
 */

export interface AdminUserLite {
  id: string;
  email: string | null;
  phone: string | null;
  status: string;
  profile: {
    firstName: string | null;
    lastName: string | null;
  } | null;
}

interface OnboardingStatusContentProps {
  onboarding: OnboardingStatus | null;
  loading: boolean;
  error: string | null;
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

/**
 * The actual onboarding-status content. Shared between the desktop side-pane
 * and this mobile modal so there is ZERO duplication of data presentation.
 * (The desktop pane renders its own <Card title="Onboarding status"> wrapping
 * this content; the mobile modal wraps it in a dialog.)
 *
 * Humanized labels: brokerConnectionStatus + missingSteps use formatEnumLabel
 * (CONNECTED → "Connected", PROFILE_INCOMPLETE → "Profile Incomplete").
 */
export function OnboardingStatusContent({ onboarding, loading, error }: OnboardingStatusContentProps) {
  if (loading) {
    return <p className="muted">Loading onboarding status…</p>;
  }
  if (error) {
    return <Alert variant="error">{error}</Alert>;
  }
  if (!onboarding) {
    return <Alert variant="error">Failed to load onboarding status.</Alert>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <strong>Can start trading:</strong>
        <Badge variant={onboarding.canStartTrading ? 'success' : 'warning'}>
          {onboarding.canStartTrading ? 'Yes' : 'No'}
        </Badge>
      </div>
      <OnboardingStep label="Profile complete" done={onboarding.profileCompleted} />
      <OnboardingStep label="Risk profile complete" done={onboarding.riskProfileCompleted} />
      <OnboardingStep label="Broker connected" done={onboarding.brokerConnected} />
      {onboarding.brokerConnected && (
        <div className="text-sm muted">
          Broker status:{' '}
          <Badge variant="info">{formatEnumLabel(onboarding.brokerConnectionStatus)}</Badge>
        </div>
      )}
      {onboarding.missingSteps.length > 0 && (
        <Alert variant="warning">
          Missing steps: {onboarding.missingSteps.map((s) => formatEnumLabel(s)).join(', ')}
        </Alert>
      )}
      {onboarding.canStartTrading && (
        <Alert variant="success">This user has completed all onboarding steps and can start trading.</Alert>
      )}
    </div>
  );
}

// ── The mobile modal ─────────────────────────────────────────────────────────

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface AdminUserOnboardingModalProps {
  open: boolean;
  user: AdminUserLite | null;
  onboarding: OnboardingStatus | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  /** Ref to the trigger card so focus can be restored after close. */
  triggerRef: React.RefObject<HTMLElement | null>;
}

export default function AdminUserOnboardingModal({
  open,
  user,
  onboarding,
  loading,
  error,
  onClose,
  triggerRef,
}: AdminUserOnboardingModalProps) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    // Capture the current focus AND the trigger card as restore targets.
    // The trigger ref may change between render and cleanup, so capture both
    // values inside the effect (per react-hooks/exhaustive-deps guidance).
    const triggerEl = triggerRef.current;
    previouslyFocusedRef.current =
      (document.activeElement as HTMLElement | null) ?? triggerEl;

    // Lock body scroll while the modal is open.
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Move focus into the modal (close button is the first focusable).
    const rafId = requestAnimationFrame(() => {
      closeBtnRef.current?.focus();
    });

    // Focus trap + Escape handler.
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusables = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
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
      // Restore focus to the trigger card (captured at effect start).
      const target = previouslyFocusedRef.current ?? triggerEl;
      target?.focus();
    };
    // onClose is stable via the parent's useCallback; triggerRef is a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open || !user) return null;

  const userLabel = user.profile?.firstName ?? '(no name)';
  const userContact = user.email ?? user.phone ?? '(no contact)';

  return (
    <div
      className="mobile-sheet-overlay admin-onboarding-modal-overlay"
      onClick={onClose}
      aria-hidden="true"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-onboarding-modal-title"
        className="mobile-sheet admin-onboarding-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mobile-sheet__header">
          <div>
            <h2 id="admin-onboarding-modal-title" className="mobile-sheet__title">
              Onboarding status
            </h2>
            <p className="text-sm muted" style={{ margin: 0 }}>
              {userLabel} {user.profile?.lastName ?? ''} — {userContact}
            </p>
          </div>
          <button
            ref={closeBtnRef}
            type="button"
            className="mobile-sheet__close"
            aria-label="Close onboarding status"
            onClick={onClose}
          >
            <CloseIcon size={20} />
          </button>
        </div>
        <div className="admin-onboarding-modal__body">
          <OnboardingStatusContent
            onboarding={onboarding}
            loading={loading}
            error={error}
          />
        </div>
      </div>
    </div>
  );
}
