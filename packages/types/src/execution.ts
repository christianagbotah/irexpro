/**
 * Frontend-safe execution contracts for web, admin, mobile, and desktop.
 *
 * These mirror the explicit backend execution DTOs and intentionally exclude
 * ownership, signal lineage, idempotency keys, broker identifiers, rejection
 * internals, and monetary P&L values that lack an authoritative currency.
 */
export type TradeExecutionStatus =
  | 'PENDING'
  | 'OPEN'
  | 'CLOSED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'RECONCILIATION_PENDING';

export type TradeExecutionDirection = 'BUY' | 'SELL';

export type TradeExecutionCloseReason =
  | 'STOP_LOSS_HIT'
  | 'TAKE_PROFIT_HIT'
  | 'MANUAL_CLOSE'
  | 'AI_CLOSE_SIGNAL'
  | 'KILL_SWITCH_FORCE_CLOSE'
  | 'BROKER_CLOSE'
  | 'RECONCILIATION';

export interface TradeExecutionView {
  id: string;
  instrument: string;
  direction: TradeExecutionDirection;
  /** Risk-engine validated lot size as a decimal string. */
  lotSize: string;
  /** Requested entry price as a decimal string. */
  requestedEntryPrice: string;
  /** Authoritative broker fill price when available. */
  fillPrice: string | null;
  stopLoss: string;
  takeProfit: string;
  trailingStopPips: string | null;
  status: TradeExecutionStatus;
  exitPrice: string | null;
  closeReason: TradeExecutionCloseReason | null;
  openedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
