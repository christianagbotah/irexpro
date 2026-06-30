import { Repository } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanPricing } from './entities/plan-pricing.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { AuditService } from '../audit/audit.service';
import { PaymentRoutingService } from '../payments/services/payment-routing.service';
export interface CheckoutRequest {
    userId: string;
    email: string;
    planId: string;
    currency: string;
    countryCode: string;
    provider?: string;
    ipAddress?: string;
}
export interface CheckoutResult {
    invoiceId: string;
    transactionId: string;
    provider: string;
    checkoutUrl?: string;
    sessionId?: string;
    requiresRedirect: boolean;
}
export declare class SubscriptionsService {
    private planRepo;
    private pricingRepo;
    private subscriptionRepo;
    private invoiceRepo;
    private transactionRepo;
    private auditService;
    private paymentRoutingService;
    private readonly logger;
    constructor(planRepo: Repository<SubscriptionPlan>, pricingRepo: Repository<PlanPricing>, subscriptionRepo: Repository<UserSubscription>, invoiceRepo: Repository<Invoice>, transactionRepo: Repository<PaymentTransaction>, auditService: AuditService, paymentRoutingService: PaymentRoutingService);
    getPlanById(planId: string): Promise<SubscriptionPlan | null>;
    findActivePlans(): Promise<SubscriptionPlan[]>;
    findUserSubscription(userId: string): Promise<UserSubscription | null>;
    canUserStartAiAutoTrading(userId: string): Promise<boolean>;
    initiateCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
    cancelSubscription(userId: string, reason?: string, ipAddress?: string): Promise<UserSubscription>;
    manualActivate(userId: string, planId: string, activatedByAdminId: string, ipAddress?: string): Promise<UserSubscription>;
    activateSubscriptionFromPayment(userId: string, planId: string | null, provider: string, providerSubscriptionReference: string | null, periodStart: Date, periodEnd: Date): Promise<UserSubscription>;
}
