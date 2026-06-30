"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var SubscriptionsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const subscription_plan_entity_1 = require("./entities/subscription-plan.entity");
const plan_pricing_entity_1 = require("./entities/plan-pricing.entity");
const user_subscription_entity_1 = require("./entities/user-subscription.entity");
const invoice_entity_1 = require("../payments/entities/invoice.entity");
const payment_transaction_entity_1 = require("../payments/entities/payment-transaction.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const payment_routing_service_1 = require("../payments/services/payment-routing.service");
let SubscriptionsService = SubscriptionsService_1 = class SubscriptionsService {
    constructor(planRepo, pricingRepo, subscriptionRepo, invoiceRepo, transactionRepo, auditService, paymentRoutingService) {
        this.planRepo = planRepo;
        this.pricingRepo = pricingRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.invoiceRepo = invoiceRepo;
        this.transactionRepo = transactionRepo;
        this.auditService = auditService;
        this.paymentRoutingService = paymentRoutingService;
        this.logger = new common_1.Logger(SubscriptionsService_1.name);
    }
    async getPlanById(planId) {
        return this.planRepo.findOne({ where: { id: planId } });
    }
    async findActivePlans() {
        return this.planRepo.find({
            where: { isActive: true },
            relations: ['pricing'],
            order: { createdAt: 'ASC' },
        });
    }
    async findUserSubscription(userId) {
        return this.subscriptionRepo.findOne({
            where: { userId },
            relations: ['plan', 'plan.pricing'],
            order: { createdAt: 'DESC' },
        });
    }
    async canUserStartAiAutoTrading(userId) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { userId },
            relations: ['plan'],
            order: { createdAt: 'DESC' },
        });
        if (!subscription)
            return false;
        if (!subscription.plan?.allowsAiAutoTrading)
            return false;
        const now = new Date();
        if (subscription.status === user_subscription_entity_1.SubscriptionStatus.TRIAL) {
            return subscription.trialEndsAt != null && now < subscription.trialEndsAt;
        }
        if (subscription.status === user_subscription_entity_1.SubscriptionStatus.ACTIVE) {
            return subscription.currentPeriodEnd != null && now < subscription.currentPeriodEnd;
        }
        return false;
    }
    async initiateCheckout(request) {
        const { userId, email, planId, currency, countryCode, provider: preferredProvider, ipAddress } = request;
        const plan = await this.planRepo.findOne({ where: { id: planId, isActive: true } });
        if (!plan)
            throw new common_1.NotFoundException('Subscription plan not found or not active');
        const pricing = await this.pricingRepo
            .createQueryBuilder('p')
            .where('p.subscription_plan_id = :planId', { planId })
            .andWhere('p.currency = :currency', { currency })
            .andWhere('p.is_active = true')
            .andWhere('(p.country_code = :countryCode OR p.country_code IS NULL)', { countryCode })
            .orderBy('p.country_code', 'DESC', 'NULLS LAST')
            .getOne();
        if (!pricing) {
            throw new common_1.BadRequestException(`No pricing available for plan ${planId} with currency ${currency} in ${countryCode}`);
        }
        const { provider, reason: routingReason } = await this.paymentRoutingService.routeForCheckout(countryCode, currency, preferredProvider);
        this.logger.log(`[Checkout] User ${userId}: plan=${planId}, provider=${provider.providerId}, reason=${routingReason}`);
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        const invoice = this.invoiceRepo.create({
            userId,
            subscriptionId: null,
            invoiceNumber,
            status: invoice_entity_1.InvoiceStatus.DRAFT,
            currency,
            subtotalAmount: pricing.amountCents,
            taxAmount: '0',
            totalAmount: pricing.amountCents,
            dueDate: null,
            metadata: { planId, planName: plan.name, countryCode, routingReason },
        });
        const savedInvoice = await this.invoiceRepo.save(invoice);
        await this.auditService.log({
            actorUserId: userId,
            actorType: 'USER',
            action: audit_action_enum_1.AuditAction.INVOICE_CREATED,
            resourceType: 'Invoice',
            resourceId: savedInvoice.id,
            ipAddress,
            metadata: {
                planId,
                currency,
                countryCode,
                invoiceNumber,
                totalAmount: pricing.amountCents,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        const transaction = this.transactionRepo.create({
            userId,
            subscriptionId: null,
            invoiceId: savedInvoice.id,
            provider: provider.providerId,
            paymentPurpose: payment_transaction_entity_1.PaymentPurpose.SUBSCRIPTION_INITIAL,
            status: payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
            currency,
            amountMinor: pricing.amountCents,
            countryCode,
        });
        const savedTx = await this.transactionRepo.save(transaction);
        const sessionRequest = {
            userId,
            email,
            planId,
            currency,
            amountMinor: Number(pricing.amountCents),
            countryCode,
            invoiceId: savedInvoice.id,
            metadata: {
                transactionId: savedTx.id,
                invoiceId: savedInvoice.id,
                planId,
            },
        };
        let sessionResult;
        try {
            sessionResult = await provider.createCheckoutSession(sessionRequest);
        }
        catch (err) {
            await this.transactionRepo.update(savedTx.id, {
                status: payment_transaction_entity_1.PaymentTransactionStatus.FAILED,
                failureMessage: 'Checkout session creation failed',
            });
            await this.auditService.log({
                actorUserId: userId,
                actorType: 'USER',
                action: audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_FAILED,
                resourceType: 'PaymentTransaction',
                resourceId: savedTx.id,
                ipAddress,
                metadata: { planId, currency, countryCode, provider: provider.providerId },
                severity: audit_log_entity_1.AuditSeverity.WARNING,
            });
            const message = err instanceof Error ? err.message : 'Checkout unavailable';
            throw new common_1.BadRequestException(`Payment checkout failed: ${message}`);
        }
        await this.transactionRepo.update(savedTx.id, {
            providerTransactionReference: sessionResult.providerTransactionReference ?? sessionResult.sessionId,
            providerPayloadSummary: { sessionId: sessionResult.sessionId, provider: provider.providerId, planId },
        });
        await this.auditService.log({
            actorUserId: userId,
            actorType: 'USER',
            action: audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_INITIATED,
            resourceType: 'PaymentTransaction',
            resourceId: savedTx.id,
            ipAddress,
            metadata: {
                planId,
                planName: plan.name,
                currency,
                countryCode,
                provider: provider.providerId,
                invoiceId: savedInvoice.id,
                amountMinor: pricing.amountCents,
                routingReason,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[Checkout] Session created: tx=${savedTx.id}, invoice=${savedInvoice.id}, provider=${provider.providerId}`);
        return {
            invoiceId: savedInvoice.id,
            transactionId: savedTx.id,
            provider: provider.providerId,
            checkoutUrl: sessionResult.checkoutUrl,
            sessionId: sessionResult.sessionId,
            requiresRedirect: !!sessionResult.checkoutUrl,
        };
    }
    async cancelSubscription(userId, reason, ipAddress) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
        if (!subscription)
            throw new common_1.NotFoundException('No active subscription found');
        if (subscription.status === user_subscription_entity_1.SubscriptionStatus.CANCELLED ||
            subscription.status === user_subscription_entity_1.SubscriptionStatus.EXPIRED) {
            throw new common_1.BadRequestException('Subscription is already cancelled or expired');
        }
        subscription.status = user_subscription_entity_1.SubscriptionStatus.CANCELLED;
        subscription.cancelledAt = new Date();
        subscription.metadata = {
            ...(subscription.metadata ?? {}),
            cancellationReason: reason ?? 'User requested cancellation',
            cancelledAt: new Date().toISOString(),
        };
        const saved = await this.subscriptionRepo.save(subscription);
        await this.auditService.log({
            actorUserId: userId,
            actorType: 'USER',
            action: audit_action_enum_1.AuditAction.SUBSCRIPTION_CANCELLED,
            resourceType: 'UserSubscription',
            resourceId: saved.id,
            ipAddress,
            metadata: {
                reason: reason ?? 'User requested',
                previousStatus: subscription.status,
                paymentProvider: subscription.paymentProvider,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[Subscription] Cancelled for user ${userId}: sub=${saved.id}`);
        return saved;
    }
    async manualActivate(userId, planId, activatedByAdminId, ipAddress) {
        const plan = await this.planRepo.findOne({ where: { id: planId } });
        if (!plan)
            throw new common_1.NotFoundException('Subscription plan not found');
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);
        let subscription = await this.subscriptionRepo.findOne({ where: { userId } });
        if (subscription) {
            subscription.subscriptionPlanId = planId;
            subscription.status = user_subscription_entity_1.SubscriptionStatus.ACTIVE;
            subscription.currentPeriodStart = now;
            subscription.currentPeriodEnd = periodEnd;
            subscription.trialEndsAt = null;
            subscription.cancelledAt = null;
            subscription.paymentProvider = 'manual';
            subscription.providerSubscriptionReference = null;
            subscription.metadata = {
                ...(subscription.metadata ?? {}),
                manualActivatedBy: activatedByAdminId,
                manualActivatedAt: now.toISOString(),
                note: 'DEV/TEST ONLY — ManualPaymentProvider activation',
            };
        }
        else {
            subscription = this.subscriptionRepo.create({
                userId,
                subscriptionPlanId: planId,
                status: user_subscription_entity_1.SubscriptionStatus.ACTIVE,
                currentPeriodStart: now,
                currentPeriodEnd: periodEnd,
                paymentProvider: 'manual',
                metadata: {
                    manualActivatedBy: activatedByAdminId,
                    manualActivatedAt: now.toISOString(),
                    note: 'DEV/TEST ONLY — ManualPaymentProvider activation',
                },
            });
        }
        const saved = await this.subscriptionRepo.save(subscription);
        await this.auditService.log({
            actorUserId: activatedByAdminId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.SUBSCRIPTION_MANUAL_ACTIVATED,
            resourceType: 'UserSubscription',
            resourceId: saved.id,
            ipAddress,
            metadata: {
                targetUserId: userId,
                planId,
                planName: plan.name,
                paymentProvider: 'manual',
                warning: 'ManualPaymentProvider — DEV/TEST only. Not for commercial use.',
            },
            severity: audit_log_entity_1.AuditSeverity.WARNING,
        });
        this.logger.warn(`[DEV/TEST] Manual subscription activated for user ${userId} by admin ${activatedByAdminId}`);
        return saved;
    }
    async activateSubscriptionFromPayment(userId, planId, provider, providerSubscriptionReference, periodStart, periodEnd) {
        let subscription = await this.subscriptionRepo.findOne({ where: { userId } });
        if (subscription) {
            if (planId)
                subscription.subscriptionPlanId = planId;
            subscription.status = user_subscription_entity_1.SubscriptionStatus.ACTIVE;
            subscription.currentPeriodStart = periodStart;
            subscription.currentPeriodEnd = periodEnd;
            subscription.cancelledAt = null;
            subscription.paymentProvider = provider;
            subscription.providerSubscriptionReference = providerSubscriptionReference;
        }
        else {
            if (!planId)
                throw new common_1.BadRequestException('Cannot activate subscription without a plan');
            subscription = this.subscriptionRepo.create({
                userId,
                subscriptionPlanId: planId,
                status: user_subscription_entity_1.SubscriptionStatus.ACTIVE,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                paymentProvider: provider,
                providerSubscriptionReference,
            });
        }
        return this.subscriptionRepo.save(subscription);
    }
};
exports.SubscriptionsService = SubscriptionsService;
exports.SubscriptionsService = SubscriptionsService = SubscriptionsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(subscription_plan_entity_1.SubscriptionPlan)),
    __param(1, (0, typeorm_1.InjectRepository)(plan_pricing_entity_1.PlanPricing)),
    __param(2, (0, typeorm_1.InjectRepository)(user_subscription_entity_1.UserSubscription)),
    __param(3, (0, typeorm_1.InjectRepository)(invoice_entity_1.Invoice)),
    __param(4, (0, typeorm_1.InjectRepository)(payment_transaction_entity_1.PaymentTransaction)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        audit_service_1.AuditService,
        payment_routing_service_1.PaymentRoutingService])
], SubscriptionsService);
//# sourceMappingURL=subscriptions.service.js.map