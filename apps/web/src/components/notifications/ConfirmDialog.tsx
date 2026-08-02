'use client';

/**
 * ConfirmDialog — accessible confirmation modal for destructive actions.
 *
 * UX-1 component.
 *
 * Behaviour:
 * - Renders a fixed, full-screen overlay with a centered panel (max-width 480px).
 * - Title (<h2>) + description (<p>) with `aria-labelledby` on the dialog.
 * - Cancel button (left, secondary) + Confirm button (right, variant by tone).
 * - Focus trap: Tab/Shift+Tab cycle only within the modal.
 * - Escape closes (calls onCancel).
 * - Click on the overlay (not the panel) closes (calls onCancel).
 * - Focus moves to the Cancel button on open (first safe action).
 * - `role="dialog"`, `aria-modal="true"`, `aria-labelledby` → title id.
 * - No browser `alert()` or `confirm()`.
 * - Styled with the existing CSS variables.
 */

import { useEffect, useId, useRef } from 'react';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // When the dialog opens, capture previously focused element and move focus
  // to the Cancel button (first safe action). Restore focus on close.
  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;

    // Move focus to the Cancel button on next paint (after the panel mounts).
    const raf = requestAnimationFrame(() => {
      cancelBtnRef.current?.focus();
    });

    // Prevent background scroll while modal is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      cancelAnimationFrame(raf);
      document.body.style.overflow = prevOverflow;
      // Restore focus to the triggering element after close.
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Focus trap + Escape handling.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (e.key === 'Tab') {
        const panel = panelRef.current;
        if (!panel) return;
        const focusables = Array.from(
          panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (focusables.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;

        if (e.shiftKey) {
          if (active === first || !panel.contains(active)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (active === last || !panel.contains(active)) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmBtnClass =
    tone === 'danger'
      ? 'btn btn--danger'
      : tone === 'warning'
        ? 'btn btn--warning'
        : 'btn btn--primary';

  return (
    <div
      className="confirm-overlay"
      onMouseDown={(e) => {
        // Close when the click starts on the overlay itself (not on the panel).
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        ref={panelRef}
        className="confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <h2 id={titleId} className="confirm-dialog__title">
          {title}
        </h2>
        <p id={descId} className="confirm-dialog__description">
          {description}
        </p>

        <div className="confirm-dialog__actions">
          <button
            ref={cancelBtnRef}
            type="button"
            className="btn btn--secondary"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={confirmBtnClass}
            onClick={onConfirm}
            // `data-tone` allows CSS to add tone-specific accents if needed.
            data-tone={tone}
            // Autofocus is set as a fallback; the useEffect above ensures
            // Cancel is actually focused on open.
            autoFocus={false}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
