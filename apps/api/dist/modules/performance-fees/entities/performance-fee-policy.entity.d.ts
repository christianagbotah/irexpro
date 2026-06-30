export declare enum BillingFrequency {
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    ANNUAL = "ANNUAL",
    ON_PROFIT_EVENT = "ON_PROFIT_EVENT"
}
export declare enum CalculationMode {
    HIGH_WATER_MARK = "HIGH_WATER_MARK"
}
export declare enum AppliesToMode {
    REALISED_PROFIT_ONLY = "REALISED_PROFIT_ONLY"
}
export declare class PerformanceFeePolicy {
    id: string;
    planId: string | null;
    name: string;
    feePercent: string;
    billingFrequency: BillingFrequency;
    calculationMode: CalculationMode;
    appliesTo: AppliesToMode;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}
