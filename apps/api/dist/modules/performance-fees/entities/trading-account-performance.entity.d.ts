export declare class TradingAccountPerformance {
    id: string;
    userId: string;
    brokerConnectionId: string | null;
    accountReference: string | null;
    currency: string;
    currentHighWaterMark: string;
    lastCalculatedEquity: string | null;
    lastRealisedBalance: string | null;
    totalDeposits: string;
    totalWithdrawals: string;
    totalRealisedProfit: string;
    totalFeesCharged: string;
    lastCalculationAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
