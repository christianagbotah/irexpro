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

export interface TraderTerminalStatus {
  risk: RiskStatusView;
  session: TradingSessionView | null;
  brokers: BrokerConnectionView[];
  /** Broker bound to the active session, when one exists and is visible. */
  sessionBroker: BrokerConnectionView | null;
  /** Best broker to surface when there is no active-session match. */
  primaryBroker: BrokerConnectionView | null;
}

/**
 * Compose existing authoritative API contracts for the trading workspace.
 *
 * This function does not infer balances, P&L, positions, AI confidence, market
 * regime, or execution quality. Those values remain absent until dedicated
 * backend contracts exist.
 */
export async function loadTraderTerminalStatus(): Promise<TraderTerminalStatus> {
  const [risk, session, brokers] = await Promise.all([
    api.request<RiskStatusView>('/risk/status'),
    api.request<TradingSessionView | null>('/trading/sessions/active'),
    api.listBrokerConnections(),
  ]);

  const sessionBroker = session
    ? brokers.find((broker) => broker.id === session.brokerConnectionId) ?? null
    : null;

  const primaryBroker =
    sessionBroker ??
    brokers.find((broker) => broker.status === 'CONNECTED') ??
    brokers[0] ??
    null;

  return {
    risk,
    session,
    brokers,
    sessionBroker,
    primaryBroker,
  };
}
