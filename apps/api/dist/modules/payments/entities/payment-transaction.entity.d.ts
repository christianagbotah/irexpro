export declare enum PaymentPurpose {
    SUBSCRIPTION_INITIAL = "SUBSCRIPTION_INITIAL",
    SUBSCRIPTION_RENEWAL = "SUBSCRIPTION_RENEWAL",
    PERFORMANCE_FEE = "PERFORMANCE_FEE",
    MANUAL_ADJUSTMENT = "MANUAL_ADJUSTMENT"
}
export declare enum PaymentTransactionStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    SUCCEEDED = "SUCCEEDED",
    FAILED = "FAILED",
    CANCELLED = "CANCELLED",
    REFUNDED = "REFUNDED"
}
export declare class PaymentTransaction {
    id: string;
    userId: string;
    subscriptionId: string | null;
    invoiceId: string | null;
    provider: string;
    providerTransactionReference: string | null;
    providerCustomerReference: string | null;
    paymentPurpose: PaymentPurpose;
    status: PaymentTransactionStatus;
    currency: string;
    amountMinor: string;
    countryCode: string | null;
    providerPayloadSummary: Record<string, unknown> | null;
    failureCode: string | null;
    failureMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
}
