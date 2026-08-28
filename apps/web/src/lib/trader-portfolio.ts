import { createPortfolioApi } from '@irexpro/api-client/portfolio';
import type {
  PortfolioAccountType,
  PortfolioAccountView,
  PortfolioConnectionStatus,
  PortfolioFinancialSnapshotView,
  PortfolioSnapshotFreshness,
  PortfolioSnapshotUnavailableReason,
} from '@irexpro/types/portfolio';
import { api } from '@/lib/api';

const portfolioApi = createPortfolioApi(api);

const ACCOUNT_KEYS = [
  'connectionId',
  'brokerName',
  'displayName',
  'accountType',
  'connectionStatus',
  'liveTradingEnabled',
  'snapshot',
  'snapshotUnavailableReason',
] as const;

const SNAPSHOT_KEYS = [
  'currency',
  'balance',
  'equity',
  'freshness',
  'syncedAt',
  'ageSeconds',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value);
  return actual.length === expected.length && actual.every((key) => expected.includes(key));
}

function isAccountType(value: unknown): value is PortfolioAccountType {
  return value === 'DEMO' || value === 'LIVE';
}

function isConnectionStatus(value: unknown): value is PortfolioConnectionStatus {
  return (
    value === 'CONNECTING' ||
    value === 'CONNECTED' ||
    value === 'DISCONNECTED' ||
    value === 'ERROR' ||
    value === 'SUSPENDED'
  );
}

function isFreshness(value: unknown): value is PortfolioSnapshotFreshness {
  return value === 'FRESH' || value === 'STALE';
}

function isUnavailableReason(value: unknown): value is PortfolioSnapshotUnavailableReason {
  return (
    value === 'NO_SYNC' ||
    value === 'CURRENCY_UNAVAILABLE' ||
    value === 'UNVERIFIED_ZERO_PLACEHOLDER'
  );
}

function isIsoDateString(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return !Number.isNaN(new Date(value).getTime());
}

function isFinancialSnapshot(value: unknown): value is PortfolioFinancialSnapshotView {
  if (!isRecord(value) || !hasExactKeys(value, SNAPSHOT_KEYS)) return false;

  return (
    typeof value.currency === 'string' &&
    /^[A-Z]{3}$/.test(value.currency) &&
    typeof value.balance === 'string' &&
    typeof value.equity === 'string' &&
    isFreshness(value.freshness) &&
    isIsoDateString(value.syncedAt) &&
    typeof value.ageSeconds === 'number' &&
    Number.isInteger(value.ageSeconds) &&
    value.ageSeconds >= 0
  );
}

export function isPortfolioAccountView(value: unknown): value is PortfolioAccountView {
  if (!isRecord(value) || !hasExactKeys(value, ACCOUNT_KEYS)) return false;

  if (
    typeof value.connectionId !== 'string' ||
    typeof value.brokerName !== 'string' ||
    !(value.displayName === null || typeof value.displayName === 'string') ||
    !isAccountType(value.accountType) ||
    !isConnectionStatus(value.connectionStatus) ||
    typeof value.liveTradingEnabled !== 'boolean'
  ) {
    return false;
  }

  if (value.snapshot === null) {
    return isUnavailableReason(value.snapshotUnavailableReason);
  }

  return isFinancialSnapshot(value.snapshot) && value.snapshotUnavailableReason === null;
}

/**
 * Loads sanitized, persisted Portfolio Truth state.
 *
 * Any unexpected broadening of the API response fails closed. Stale values are
 * allowed only when the server explicitly labels them STALE; the browser never
 * infers freshness or reconstructs monetary values.
 */
export async function loadTraderPortfolio(): Promise<PortfolioAccountView[]> {
  const accounts = await portfolioApi.listAccounts();
  if (!Array.isArray(accounts) || !accounts.every(isPortfolioAccountView)) {
    throw new Error('Portfolio accounts contract mismatch');
  }
  return accounts;
}
