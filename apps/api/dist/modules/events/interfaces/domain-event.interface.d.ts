import { DomainEventType } from '../enums/domain-event-type.enum';
export interface DomainEvent<T = Record<string, unknown>> {
    type: DomainEventType;
    userId: string;
    payload: T;
    timestamp: Date;
}
export interface TradingSessionEventPayload {
    sessionId: string;
    userId: string;
    brokerConnectionId: string;
    status: string;
    startedAt?: Date;
    endedAt?: Date;
}
export interface TradeEventPayload {
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
    idempotencyKey?: string;
}
export interface RiskDecisionEventPayload {
    userId: string;
    sessionId?: string;
    instrument: string;
    direction: string;
    decision: 'APPROVED' | 'REJECTED' | 'SUSPENDED';
    rejectionCode?: string;
    rejectionReason?: string;
    idempotencyKey?: string;
}
export interface BrokerStatusEventPayload {
    userId: string;
    connectionId: string;
    status: string;
    previousStatus?: string;
    reason?: string;
}
export interface AiSignalEventPayload {
    signalId: string;
    userId: string;
    sessionId?: string;
    instrument: string;
    direction: string;
    confidenceScore: number;
    strategyCode: string;
    ignoredReason?: string;
}
export interface SystemNotificationPayload {
    userId: string;
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'error';
    code?: string;
}
