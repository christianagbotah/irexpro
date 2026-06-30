export declare enum TradeSourceType {
    LIVE_BROKER = "LIVE_BROKER",
    DEMO_BROKER = "DEMO_BROKER",
    PAPER_BROKER = "PAPER_BROKER",
    BACKTEST = "BACKTEST"
}
export declare class BrokerReconciledTrade {
    id: string;
    userId: string;
    brokerConnectionId: string;
    brokerProvider: string;
    brokerTradeId: string;
    brokerOrderId: string | null;
    instrument: string;
    direction: 'BUY' | 'SELL';
    volume: string;
    openedAt: Date | null;
    closedAt: Date;
    entryPrice: string | null;
    exitPrice: string | null;
    realisedPnl: string;
    commission: string;
    swap: string;
    netRealisedPnl: string;
    currency: string;
    reconciliationRunId: string | null;
    ledgerEntryId: string | null;
    sourceType: TradeSourceType;
    isFeeEligible: boolean;
    createdAt: Date;
    updatedAt: Date;
}
