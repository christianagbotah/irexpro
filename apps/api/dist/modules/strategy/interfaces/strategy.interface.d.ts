export interface AiSignalCandidate {
    signalId: string;
    userId: string;
    tradingSessionId: string;
    brokerConnectionId: string;
    instrument: string;
    direction: 'BUY' | 'SELL';
    confidenceScore: number;
    suggestedEntryPrice?: number;
    suggestedStopLoss: number;
    suggestedTakeProfit: number;
    suggestedVolume: number;
    timeframe: string;
    strategyCode: string;
    marketRegime?: string;
    volatilityScore?: number;
    generatedAt: Date;
    modelVersion: string;
    metadata?: Record<string, unknown>;
}
export type StrategyOutcome = 'SIGNAL_INVALID' | 'LOW_CONFIDENCE' | 'SESSION_INACTIVE' | 'NO_SUBSCRIPTION' | 'NO_BROKER_CONNECTION' | 'RISK_REJECTED' | 'RISK_SUSPENDED' | 'EXECUTION_FAILED' | 'EXECUTION_SUCCEEDED';
export interface StrategyResult {
    outcome: StrategyOutcome;
    signalId: string;
    tradeId?: string;
    reason?: string;
}
