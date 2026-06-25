import { Repository } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { AuditService } from '../audit/audit.service';
export declare class SubscriptionsService {
    private planRepo;
    private subscriptionRepo;
    private auditService;
    private readonly logger;
    constructor(planRepo: Repository<SubscriptionPlan>, subscriptionRepo: Repository<UserSubscription>, auditService: AuditService);
    findActivePlans(): Promise<SubscriptionPlan[]>;
    findUserSubscription(userId: string): Promise<UserSubscription | null>;
    canUserStartAiAutoTrading(userId: string): Promise<boolean>;
    manualActivate(userId: string, planId: string, activatedByAdminId: string, ipAddress?: string): Promise<UserSubscription>;
}
