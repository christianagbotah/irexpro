export declare enum LedgerEntryType {
    DEPOSIT = "DEPOSIT",
    WITHDRAWAL = "WITHDRAWAL",
    REALISED_TRADE_PROFIT = "REALISED_TRADE_PROFIT",
    REALISED_TRADE_LOSS = "REALISED_TRADE_LOSS",
    FEE_ASSESSED = "FEE_ASSESSED",
    FEE_PAID = "FEE_PAID",
    ADJUSTMENT = "ADJUSTMENT"
}
export declare class PerformanceFeeLedgerEntry {
    id: string;
    userId: string;
    assessmentId: string | null;
    brokerConnectionId: string | null;
    entryType: LedgerEntryType;
    currency: string;
    amount: string;
    sourceReference: string | null;
    occurredAt: Date;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
}
