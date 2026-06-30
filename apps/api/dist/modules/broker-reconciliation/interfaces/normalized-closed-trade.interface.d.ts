export interface NormalizedClosedTrade {
    brokerTradeId: string;
    brokerOrderId: string | null;
    instrument: string;
    direction: 'BUY' | 'SELL';
    volume: string;
    openedAt: Date | null;
    closedAt: Date;
    entryPrice: string | null;
    exitPrice: string | null;
    grossRealisedPnl: string;
    commission: string;
    swap: string;
    netRealisedPnl: string;
    currency: string;
    rawMetadataSummary: Record<string, unknown>;
}
