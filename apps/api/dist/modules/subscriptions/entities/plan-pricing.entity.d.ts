import { SubscriptionPlan } from './subscription-plan.entity';
export declare class PlanPricing {
    id: string;
    subscriptionPlanId: string;
    countryCode: string | null;
    currency: string;
    amountCents: string;
    providerPlanId: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    plan: SubscriptionPlan;
}
