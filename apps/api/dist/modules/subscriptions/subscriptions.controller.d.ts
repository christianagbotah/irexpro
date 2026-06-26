import { Request } from 'express';
import { SubscriptionsService } from './subscriptions.service';
import { ManualActivateDto } from './dto/manual-activate.dto';
import { CheckoutDto, CancelSubscriptionDto } from './dto/checkout.dto';
import { User } from '../users/entities/user.entity';
export declare class SubscriptionsController {
    private readonly subscriptionsService;
    constructor(subscriptionsService: SubscriptionsService);
    getPlans(): Promise<import("./entities/subscription-plan.entity").SubscriptionPlan[]>;
    getMySubscription(user: User): Promise<import("./entities/user-subscription.entity").UserSubscription | null>;
    checkout(dto: CheckoutDto, user: User, req: Request): Promise<import("./subscriptions.service").CheckoutResult>;
    cancelSubscription(dto: CancelSubscriptionDto, user: User, req: Request): Promise<import("./entities/user-subscription.entity").UserSubscription>;
    manualActivate(dto: ManualActivateDto, admin: User, req: Request): Promise<import("./entities/user-subscription.entity").UserSubscription>;
}
