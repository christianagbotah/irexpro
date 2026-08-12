/**
 * Professional SVG icon set for the iRexPro web app — Sprint 31 remediation.
 *
 * Replaces the emoji icons previously used in the mobile bottom navigation and
 * "More" sheet. Emoji render inconsistently across Android, iOS, Windows and
 * macOS (different glyph sets, color emoji vs. monochrome, varying widths),
 * which is unacceptable for an enterprise trading product. These inline SVG
 * icons render identically everywhere, support `currentColor`, and have a
 * consistent visual weight (1.75 stroke, 24×24 viewBox, Lucide-style outline).
 *
 * Design rules:
 *   - viewBox="0 0 24 24", fill="none", stroke="currentColor", strokeWidth 1.75
 *   - strokeLinecap="round", strokeLinejoin="round" (rounded, professional)
 *   - aria-hidden="true" + focusable="false" — the icon is decorative; the
 *     adjacent text label provides the accessible name (per architect §7).
 *   - No new dependencies. Mirrors the existing InfoCircleIcon pattern in
 *     apps/web/src/components/ui/InfoTooltip.tsx.
 *
 * Each icon accepts a `size` prop (default 24) so callers can scale without
 * introducing a separate stylesheet. The `title` prop is intentionally absent —
 * icons are decorative; if an icon-only button is ever needed, the caller must
 * supply its own aria-label.
 */
import type { SVGProps } from 'react';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'aria-hidden'> {
  size?: number;
}

function Svg({ size = 24, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

// ── Primary navigation icons ────────────────────────────────────────────────

/** Dashboard — four-quadrant grid (home/overview). */
export function DashboardIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </Svg>
  );
}

/** Payments — credit card. */
export function PaymentsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 9.5h20" />
      <path d="M6 15h4" />
    </Svg>
  );
}

/** More — three horizontal dots (overflow). */
export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

// ── Secondary (More sheet) icons ─────────────────────────────────────────────

/** Profile — single user bust. */
export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </Svg>
  );
}

/** Risk limits — shield. */
export function ShieldIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l7 2.5v5.5c0 4.3-2.9 7.8-7 9-4.1-1.2-7-4.7-7-9V5.5L12 3z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

/** Broker — plug/connection. */
export function PlugIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 2v6" />
      <path d="M15 2v6" />
      <path d="M7 8h10v3a5 5 0 0 1-10 0V8z" />
      <path d="M12 16v6" />
    </Svg>
  );
}

/** Log out — door + arrow. */
export function LogoutIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M9 12h11" />
      <path d="M16 8l4 4-4 4" />
    </Svg>
  );
}

/** Close — X. */
export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </Svg>
  );
}
