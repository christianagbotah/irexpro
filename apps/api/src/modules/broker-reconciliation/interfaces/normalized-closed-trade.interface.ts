/**
 * NormalizedClosedTrade
 *
 * Canonical representation of a closed broker trade after normalization.
 * All validation and sanitisation has been applied before a trade reaches this form.
 *
 * RULES:
 * - brokerTradeId must be non-empty (trades without IDs are rejected before normalization).
 * - closedAt must be in the past (future-dated trades are rejected).
 * - netRealisedPnl = grossRealisedPnl + commission + swap (no double-subtraction).
 * - commission and swap are signed: negative = cost, positive = credit.
 * - All monetary amounts are in minor currency units (bigint strings, ×100 for 2dp currencies).
 * - rawMetadataSummary must NOT contain credentials, server URLs, account keys, or other secrets.
 */
export interface NormalizedClosedTrade {
  /** Broker-side unique deal/trade identifier. Used for deduplication. */
  brokerTradeId: string;

  /** Optional parent order ID — may differ from the deal/trade ID */
  brokerOrderId: string | null;

  instrument: string;
  direction: 'BUY' | 'SELL';

  /** Lot size as a decimal string (e.g. "1.00") */
  volume: string;

  openedAt: Date | null;
  closedAt: Date;

  entryPrice: string | null;
  exitPrice: string | null;

  /** Gross P&L before commission/swap, in minor currency units */
  grossRealisedPnl: string;

  /** Commission in minor units (negative = cost, 0 if not applicable) */
  commission: string;

  /** Swap/rollover in minor units (can be positive or negative) */
  swap: string;

  /**
   * Net realised P&L = grossRealisedPnl + commission + swap.
   * This is the single source of truth for fee calculations.
   * Do NOT subtract commission/swap again when using this value.
   */
  netRealisedPnl: string;

  currency: string;

  /**
   * Safe metadata summary for audit purposes.
   * Must not contain API keys, passwords, session tokens, account IDs that could
   * identify individual users, or any other sensitive data.
   */
  rawMetadataSummary: Record<string, unknown>;
}
