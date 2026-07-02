export declare enum BillingCycleStatus {
    DRAFT = "DRAFT",
    RECONCILING = "RECONCILING",
    RECONCILED = "RECONCILED",
    ASSESSING = "ASSESSING",
    ASSESSED = "ASSESSED",
    INVOICED = "INVOICED",
    NO_FEE_DUE = "NO_FEE_DUE",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED"
}
export declare const FINAL_BILLING_CYCLE_STATUSES: Set<BillingCycleStatus>;
export declare class PerformanceFeeBillingCycle {
    id: string;
    userId: string;
    brokerConnectionId: string | null;
    periodStart: Date;
    periodEnd: Date;
    currency: string;
    status: BillingCycleStatus;
    reconciliationRunId: string | null;
    assessmentId: string | null;
    invoiceId: string | null;
    totalLedgerEntriesCreated: number;
    totalRealisedProfit: string;
    feeAmount: string;
    errorSummary: string | null;
    metadata: Record<string, unknown> | null;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
}
