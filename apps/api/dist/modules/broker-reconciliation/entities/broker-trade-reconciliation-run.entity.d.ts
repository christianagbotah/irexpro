export declare enum ReconciliationRunStatus {
    PENDING = "PENDING",
    RUNNING = "RUNNING",
    COMPLETED = "COMPLETED",
    COMPLETED_WITH_WARNINGS = "COMPLETED_WITH_WARNINGS",
    FAILED = "FAILED"
}
export declare class BrokerTradeReconciliationRun {
    id: string;
    userId: string;
    brokerConnectionId: string;
    status: ReconciliationRunStatus;
    startedAt: Date | null;
    completedAt: Date | null;
    fromTime: Date;
    toTime: Date;
    totalBrokerTradesSeen: number;
    newLedgerEntriesCreated: number;
    duplicateTradesSkipped: number;
    failedTrades: number;
    errorSummary: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}
