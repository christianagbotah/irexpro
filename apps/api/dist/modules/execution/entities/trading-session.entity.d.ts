export declare enum TradingSessionStatus {
    ACTIVE = "ACTIVE",
    PAUSED = "PAUSED",
    SUSPENDED_RISK_LIMIT = "SUSPENDED_RISK_LIMIT",
    SUSPENDED_BROKER = "SUSPENDED_BROKER",
    ENDED = "ENDED"
}
export declare class TradingSession {
    id: string;
    userId: string;
    brokerConnectionId: string;
    status: TradingSessionStatus;
    openingBalance: string | null;
    peakEquity: string | null;
    riskProfileSnapshot: Record<string, unknown> | null;
    startedAt: Date;
    endedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
