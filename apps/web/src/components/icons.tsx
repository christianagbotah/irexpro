/**
 * Professional SVG icon set for the iRexPro web app.
 *
 * Inline SVG keeps the trading shell dependency-light while guaranteeing
 * consistent rendering across desktop and mobile platforms. Icons use
 * currentColor and are decorative by default; accessible names belong to the
 * adjacent navigation labels or icon-button aria-labels.
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

/** Dashboard — four-quadrant overview. */
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

/** Trading workspace — candlestick chart. */
export function TradeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6 2v20" />
      <rect x="4" y="6" width="4" height="7" rx="1" />
      <path d="M12 3v18" />
      <rect x="10" y="10" width="4" height="6" rx="1" />
      <path d="M18 2v20" />
      <rect x="16" y="5" width="4" height="9" rx="1" />
    </Svg>
  );
}

/** AI command center — processor/circuit. */
export function AiIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4" />
      <path d="M9.5 13.5l2.5-5 2.5 5M10.5 11.5h3" />
    </Svg>
  );
}

/** Portfolio intelligence — layered performance curve. */
export function PortfolioIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 19h18" />
      <path d="M5 16l4-5 3 2 6-7" />
      <path d="M15 6h3v3" />
      <path d="M5 5v11" />
    </Svg>
  );
}

/** Payments / performance fees — credit card. */
export function PaymentsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="2" y="5" width="20" height="14" rx="2.5" />
      <path d="M2 9.5h20" />
      <path d="M6 15h4" />
    </Svg>
  );
}

/** More — three horizontal dots. */
export function MoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

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
