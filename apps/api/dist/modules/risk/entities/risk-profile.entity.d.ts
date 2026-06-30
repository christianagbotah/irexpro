export declare class RiskProfile {
    id: string;
    userId: string;
    killSwitchActive: boolean;
    killSwitchReason: string | null;
    maxDailyLossPercent: string;
    maxDrawdownPercent: string;
    maxOpenTrades: number;
    maxDailyTrades: number;
    maxPositionSizeLot: string;
    minStopLossPips: string;
    allowedInstruments: string[] | null;
    maxVolatilityScore: string;
    rejectLowLiquidity: boolean;
    createdAt: Date;
    updatedAt: Date;
}
