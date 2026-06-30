import { PlanPricing } from './plan-pricing.entity';
import { UserSubscription } from './user-subscription.entity';
export declare enum BillingInterval {
    MONTHLY = "MONTHLY",
    QUARTERLY = "QUARTERLY",
    ANNUAL = "ANNUAL"
}
export declare class SubscriptionPlan {
    id: string;
    name: string;
    code: string;
    description: string | null;
    billingInterval: BillingInterval;
    trialDays: number;
    performanceFeeRate: string;
    maxConcurrentTrades: number;
    allowsAiAutoTrading: boolean;
    features: Record<string, unknown> | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    pricing: PlanPricing[];
    subscriptions: UserSubscription[];
}
