export type RiskDecisionStatus = 'APPROVED' | 'REJECTED' | 'SUSPENDED';
export interface RiskApprovalResult {
    decision: 'APPROVED';
    signalId: string;
    validatedOrder: ValidatedOrder;
    appliedRules: string[];
    riskScore: number;
    evaluatedAt: Date;
}
export interface RiskRejectionResult {
    decision: 'REJECTED' | 'SUSPENDED';
    signalId: string;
    rejectionCode: RiskRejectionCode;
    rejectionReason: string;
    evaluatedAt: Date;
}
export type RiskDecision = RiskApprovalResult | RiskRejectionResult;
export interface ValidatedOrder {
    instrument: string;
    direction: 'BUY' | 'SELL';
    lotSize: string;
    entryPrice: string;
    stopLoss: string;
    takeProfit: string;
    trailingStopPips?: string;
    idempotencyKey: string;
}
export interface ProposedTrade {
    signalId: string;
    instrument: string;
    direction: 'BUY' | 'SELL';
    requestedLotSize: string;
    entryPrice: string;
    stopLoss?: string;
    takeProfit?: string;
    trailingStopPips?: string;
    idempotencyKey: string;
    volatilityScore?: number;
    regime?: 'TRENDING' | 'RANGING' | 'LOW_LIQUIDITY' | 'HIGH_VOLATILITY';
}
export declare enum RiskRejectionCode {
    KILL_SWITCH_ACTIVE = "KILL_SWITCH_ACTIVE",
    SESSION_NOT_ACTIVE = "SESSION_NOT_ACTIVE",
    BROKER_DISCONNECTED = "BROKER_DISCONNECTED",
    DAILY_LOSS_LIMIT_REACHED = "DAILY_LOSS_LIMIT_REACHED",
    MAX_DRAWDOWN_REACHED = "MAX_DRAWDOWN_REACHED",
    INSUFFICIENT_MARGIN = "INSUFFICIENT_MARGIN",
    MAX_CONCURRENT_TRADES = "MAX_CONCURRENT_TRADES",
    MAX_DAILY_TRADES = "MAX_DAILY_TRADES",
    POSITION_SIZE_EXCEEDED = "POSITION_SIZE_EXCEEDED",
    MISSING_STOP_LOSS = "MISSING_STOP_LOSS",
    MISSING_TAKE_PROFIT = "MISSING_TAKE_PROFIT",
    INVALID_SL_DISTANCE = "INVALID_SL_DISTANCE",
    INVALID_TP_DIRECTION = "INVALID_TP_DIRECTION",
    LEVERAGE_EXCEEDED = "LEVERAGE_EXCEEDED",
    INSTRUMENT_NOT_ALLOWED = "INSTRUMENT_NOT_ALLOWED",
    HIGH_VOLATILITY = "HIGH_VOLATILITY",
    LOW_LIQUIDITY_REGIME = "LOW_LIQUIDITY_REGIME",
    DUPLICATE_SIGNAL = "DUPLICATE_SIGNAL",
    RISK_ENGINE_ERROR = "RISK_ENGINE_ERROR"
}
export interface RiskContextSnapshot {
    userId: string;
    signalId: string;
    killSwitchActive: boolean;
    brokerConnected: boolean;
    brokerBalance?: string;
    brokerEquity?: string;
    openTradesCount?: number;
    dailyRealisedPnl?: string;
    proposedLotSize: string;
    proposedInstrument: string;
    checkedAt: Date;
}
