export declare enum AssessmentStatus {
    DRAFT = "DRAFT",
    ASSESSED = "ASSESSED",
    INVOICED = "INVOICED",
    WAIVED = "WAIVED",
    PAID = "PAID",
    CANCELLED = "CANCELLED"
}
export declare class PerformanceFeeAssessment {
    id: string;
    userId: string;
    brokerConnectionId: string | null;
    subscriptionId: string | null;
    invoiceId: string | null;
    currency: string;
    periodStart: Date;
    periodEnd: Date;
    startingHighWaterMark: string;
    endingRealisedBalance: string;
    depositsExcluded: string;
    withdrawalsAdjusted: string;
    realisedProfitForFee: string;
    feePercent: string;
    feeAmount: string;
    status: AssessmentStatus;
    calculationMetadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}
