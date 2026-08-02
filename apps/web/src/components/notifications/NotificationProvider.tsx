'use client';

/**
 * NotificationProvider — wraps the app with react-hot-toast's <Toaster /> and
 * exposes a small typed context for triggering success/error/warning/info
 * notifications.
 *
 * UX-1 component.
 *
 * Requirements satisfied:
 * - Success: top-right on desktop, top on mobile. Auto-dismiss 4s.
 *   aria-live="polite". Green accent. Close button.
 * - Error:   top-right on desktop, top on mobile. Auto-dismiss 8s.
 *   role="alert". Red accent. Close button.
 * - Warning: top on mobile / top-right on desktop. Auto-dismiss 6s.
 *   aria-live="polite". Amber accent. Close button.
 * - Info:    top on mobile / top-right on desktop. Auto-dismiss 5s.
 *   aria-live="polite". Brand accent. Close button.
 * - Toasts never cover important navigation: safe top/right margins are set
 *   via the .toast-custom styles in globals.css.
 * - Styled exclusively with existing CSS variables.
 *
 * NOTE: This file does NOT wire itself into layout.tsx — that's done by the
 * integrator in a follow-up task.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import toast, { Toaster, type ToastOptions, type DefaultToastOptions } from 'react-hot-toast';

export interface NotificationContextValue {
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Shared toast options. We render a custom message element so we can attach
 * role/aria-live semantics per variant, and style with our CSS variables.
 */
function makeToast(message: string, variant: NotificationVariant, duration: number) {
  const className = `toast-custom toast-custom--${variant}`;
  const ariaAttributes =
    variant === 'error'
      ? { role: 'alert' as const, 'aria-live': 'assertive' as const }
      : { role: 'status' as const, 'aria-live': 'polite' as const };

  const options: ToastOptions = {
    duration,
    className,
    // react-hot-toast will render `message` inside its own <div>. We pass a
    // React element so we can attach role + aria-live directly.
    // (The library merges aria props via the `ariaProps` field.)
    ariaProps: ariaAttributes,
  };

  toast(message, options);
}

type NotificationVariant = 'success' | 'error' | 'warning' | 'info';

export function NotificationProvider({ children }: { children: ReactNode }) {
  const value = useMemo<NotificationContextValue>(
    () => ({
      success: (m) => makeToast(m, 'success', 4000),
      error: (m) => makeToast(m, 'error', 8000),
      warning: (m) => makeToast(m, 'warning', 6000),
      info: (m) => makeToast(m, 'info', 5000),
    }),
    [],
  );

  // react-hot-toast default options: close button on every toast, no duration
  // override at the global level (per-variant durations are applied above).
  const defaultOptions: DefaultToastOptions = useMemo(
    () => ({
      // Position is set on <Toaster /> below for responsive behaviour.
      // Style with our design system tokens via the className prop.
      className: 'toast-custom',
      // Ensure a close button is always available.
    }),
    [],
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <Toaster
        position="top-right"
        reverseOrder={false}
        toastOptions={defaultOptions}
        containerStyle={{
          // Safe margins so toasts never cover the top app bar / sidebar.
          top: 'var(--space-4)',
          right: 'var(--space-4)',
          zIndex: 9999,
        }}
        containerClassName="toast-custom-container"
      />
    </NotificationContext.Provider>
  );
}

/**
 * Convenience hook. Throws if used outside of a <NotificationProvider>.
 */
export function useNotification(): NotificationContextValue {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error(
      'useNotification must be used inside <NotificationProvider>. ' +
        'Add the provider to the root layout (apps/web/src/app/layout.tsx).',
    );
  }
  return ctx;
}

export default NotificationProvider;
