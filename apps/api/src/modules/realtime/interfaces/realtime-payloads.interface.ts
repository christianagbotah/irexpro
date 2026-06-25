/**
 * Safe WebSocket payload interfaces.
 *
 * All payloads sent over WebSocket MUST conform to these interfaces.
 * Never include secrets, credentials, tokens, or raw stack traces.
 */

export interface WsTradingSessionPayload {
  sessionId: string;
  userId: string;
  brokerConnectionId: string;
  status: string;
  startedAt?: string;
  endedAt?: string;
}

export interface WsTradePayload {
  tradeId: string;
  userId: string;
  sessionId?: string;
  instrument: string;
  direction: string;
  volume: string;
  status: string;
  entryPrice?: string;
  exitPrice?: string;
  realisedPnl?: string;
  reason?: string;
}

export interface WsRiskDecisionPayload {
  userId: string;
  sessionId?: string;
  instrument: string;
  direction: string;
  decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  rejectionCode?: string;
  rejectionReason?: string;
}

export interface WsBrokerStatusPayload {
  connectionId: string;
  status: string;
  previousStatus?: string;
  reason?: string;
}

export interface WsAiSignalPayload {
  signalId: string;
  instrument: string;
  direction: string;
  confidenceScore: number;
  strategyCode: string;
  ignoredReason?: string;
}

export interface WsSystemNotificationPayload {
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'error';
  code?: string;
}
