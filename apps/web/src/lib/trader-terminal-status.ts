import type { BrokerConnectionView } from '@irexpro/types';
import { api } from '@/lib/api';

export type TradingSessionStatusView =
  | 'ACTIVE'
  | 'PAUSED'
  | 'SUSPENDED_RISK_LIMIT'
  | 'SUSPENDED_BROKER'
  | 'ENDED';

/** Browser-facing shape returned by TradingSessionResponseDto. */
export interface TradingSessionView {
  id: string;
  brokerConnectionId: string;
  status: TradingSessionStatusView;
  startedAt: string;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** GET /risk/status — authoritative risk-gate summary. */
export interface RiskStatusView {
  killSwitchActive: boolean;
  brokerConnected: boolean;
  canTrade: boolean;
  limits: {
    maxDailyLossPercent: string;
    maxDrawdownPercent: string;
    maxOpenTrades: number;
    maxPositionSizeLot: string;
    allowedInstruments: string[] | 'ALL';
    maxVolatilityScore: string;
  };
}

/**
 * Broker fields the terminal is allowed to consume. This intentionally omits
 * the historical frontend type's userId assumption because the backend's
 * BrokerConnectionResponseDto does not expose userId.
 */
export type TerminalBrokerView = Pick<
  BrokerConnectionView,
  | 'id'
  | 'brokerId'
  | 'brokerName'
  | 'displayName'
  | 'accountType'
  | 'status'
  | 'liveTradingEnabled'
  | 'lastHealthCheckAt'
  | 'lastErrorMessage'
>;

export interface TraderTerminalStatus {
  risk: RiskStatusView;
  session: TradingSessionView | null;
  brokers: TerminalBrokerView[];
  /** Broker bound to the active session, when one exists and is visible. */
  sessionBroker: TerminalBrokerView | null;
  /** Best broker to surface when there is no active-session match. */
  primaryBroker: TerminalBrokerView | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTradingSessionStatus(value: unknown): value is TradingSessionStatusView {
  return (
    value === 'ACTIVE' ||
    value === 'PAUSED' ||
    value === 'SUSPENDED_RISK_LIMIT' ||
    value === 'SUSPENDED_BROKER' ||
    value === 'ENDED'
  );
}

function isRiskStatus(value: unknown): value is RiskStatusView {
  if (!isRecord(value) || !isRecord(value.limits)) return false;
  const limits = value.limits;
  const allowed = limits.allowedInstruments;
  const allowedIsValid =
    allowed === 'ALL' ||
    (Array.isArray(allowed) && allowed.every((instrument) => typeof instrument === 'string'));

  return (
    typeof value.killSwitchActive === 'boolean' &&
    typeof value.brokerConnected === 'boolean' &&
    typeof value.canTrade === 'boolean' &&
    typeof limits.maxDailyLossPercent === 'string' &&
    typeof limits.maxDrawdownPercent === 'string' &&
    typeof limits.maxOpenTrades === 'number' &&
    typeof limits.maxPositionSizeLot === 'string' &&
    allowedIsValid &&
    typeof limits.maxVolatilityScore === 'string'
  );
}

function isTradingSession(value: unknown): value is TradingSessionView {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.brokerConnectionId === 'string' &&
    isTradingSessionStatus(value.status) &&
    typeof value.startedAt === 'string' &&
    (value.endedAt === null || typeof value.endedAt === 'string') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function isTerminalBroker(value: unknown): value is TerminalBrokerView {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.brokerId === 'string' &&
    typeof value.brokerName === 'string' &&
    (value.displayName === null || typeof value.displayName === 'string') &&
    (value.accountType === 'DEMO' || value.accountType === 'LIVE') &&
    typeof value.status === 'string' &&
    typeof value.liveTradingEnabled === 'boolean' &&
    (value.lastHealthCheckAt === null || typeof value.lastHealthCheckAt === 'string') &&
    (value.lastErrorMessage === null || typeof value.lastErrorMessage === 'string')
  );
}

/**
 * Compose existing authoritative API contracts for the trading workspace.
 *
 * This function does not infer balances, P&L, positions, AI confidence, market
 * regime, or execution quality. Those values remain absent until dedicated
 * backend contracts exist. Runtime checks fail closed when an API response does
 * not match the expected frontend-safe contract.
 */
export async function loadTraderTerminalStatus(): Promise<TraderTerminalStatus> {
  const [riskPayload, sessionPayload, brokerPayload] = await Promise.all([
    api.request<unknown>('/risk/status'),
    api.request<unknown>('/trading/sessions/active'),
    api.listBrokerConnections(),
  ]);

  if (!isRiskStatus(riskPayload)) {
    throw new Error('Risk status contract mismatch');
  }
  if (sessionPayload !== null && !isTradingSession(sessionPayload)) {
    throw new Error('Trading session contract mismatch');
  }
  if (!Array.isArray(brokerPayload) || !brokerPayload.every(isTerminalBroker)) {
    throw new Error('Broker connection contract mismatch');
  }

  const session = sessionPayload;
  const brokers: TerminalBrokerView[] = brokerPayload;
  const sessionBroker = session
    ? brokers.find((broker) => broker.id === session.brokerConnectionId) ?? null
    : null;

  const primaryBroker =
    sessionBroker ??
    brokers.find((broker) => broker.status === 'CONNECTED') ??
    brokers[0] ??
    null;

  return {
    risk: riskPayload,
    session,
    brokers,
    sessionBroker,
    primaryBroker,
  };
}
