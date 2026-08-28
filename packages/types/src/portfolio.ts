/**
 * Frontend-safe Portfolio Truth contracts for web, admin, mobile, and desktop.
 *
 * Monetary values are decimal strings and are never exposed without an
 * authoritative three-letter account currency. Fields that the current broker
 * health sync does not reliably refresh (margin, free margin, margin level,
 * leverage, open-position count, derived P&L) are intentionally absent.
 */
export type PortfolioAccountType = 'DEMO' | 'LIVE';

export type PortfolioConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'ERROR'
  | 'SUSPENDED';

export type PortfolioSnapshotFreshness = 'FRESH' | 'STALE';

export type PortfolioSnapshotUnavailableReason =
  | 'NO_SYNC'
  | 'CURRENCY_UNAVAILABLE'
  | 'UNVERIFIED_ZERO_PLACEHOLDER';

export interface PortfolioFinancialSnapshotView {
  currency: string;
  balance: string;
  equity: string;
  freshness: PortfolioSnapshotFreshness;
  syncedAt: string;
  ageSeconds: number;
}

export interface PortfolioAccountView {
  connectionId: string;
  brokerName: string;
  displayName: string | null;
  accountType: PortfolioAccountType;
  connectionStatus: PortfolioConnectionStatus;
  liveTradingEnabled: boolean;
  snapshot: PortfolioFinancialSnapshotView | null;
  snapshotUnavailableReason: PortfolioSnapshotUnavailableReason | null;
}
