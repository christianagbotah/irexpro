export declare class UpdateRiskProfileDto {
    maxDailyLossPercent?: number;
    maxDrawdownPercent?: number;
    maxOpenTrades?: number;
    maxDailyTrades?: number;
    maxPositionSizeLot?: number;
    minStopLossPips?: number;
    allowedInstruments?: string[] | null;
    maxVolatilityScore?: number;
    rejectLowLiquidity?: boolean;
}
