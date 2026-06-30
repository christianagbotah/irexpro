export declare class SimulateSignalDto {
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
    modelVersion: string;
}
