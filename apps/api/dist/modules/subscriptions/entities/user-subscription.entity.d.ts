import { User } from '../../users/entities/user.entity';
import { SubscriptionPlan } from './subscription-plan.entity';
export declare enum SubscriptionStatus {
    TRIAL = "TRIAL",
    ACTIVE = "ACTIVE",
    PAST_DUE = "PAST_DUE",
    SUSPENDED = "SUSPENDED",
    CANCELLED = "CANCELLED",
    EXPIRED = "EXPIRED"
}
export declare class UserSubscription {
    id: string;
    userId: string;
    subscriptionPlanId: string;
    status: SubscriptionStatus;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    trialEndsAt: Date | null;
    cancelledAt: Date | null;
    paymentProvider: string | null;
    providerSubscriptionReference: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
    user: User;
    plan: SubscriptionPlan;
}
