export declare class AiSignalCandidateDto {
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
