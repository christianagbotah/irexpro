import { BillingFrequency } from '../entities/performance-fee-policy.entity';
export declare class CreatePolicyDto {
    planId?: string;
    name: string;
    feePercent: number;
    billingFrequency: BillingFrequency;
}
