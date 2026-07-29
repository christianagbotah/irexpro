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
exports.SubscriptionsService = exports.CheckoutReason = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const subscription_plan_entity_1 = require("./entities/subscription-plan.entity");
const plan_pricing_entity_1 = require("./entities/plan-pricing.entity");
const user_subscription_entity_1 = require("./entities/user-subscription.entity");
const invoice_entity_1 = require("../payments/entities/invoice.entity");
const payment_transaction_entity_1 = require("../payments/entities/payment-transaction.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const payment_routing_service_1 = require("../payments/services/payment-routing.service");
var CheckoutReason;
(function (CheckoutReason) {
    CheckoutReason["NEW_CHECKOUT"] = "NEW_CHECKOUT";
    CheckoutReason["REUSED_PENDING_CHECKOUT"] = "REUSED_PENDING_CHECKOUT";
    CheckoutReason["PROVIDER_SESSION_REUSED"] = "PROVIDER_SESSION_REUSED";
    CheckoutReason["IDEMPOTENCY_KEY_REPLAY"] = "IDEMPOTENCY_KEY_REPLAY";
})(CheckoutReason || (exports.CheckoutReason = CheckoutReason = {}));
const PENDING_INVOICE_STATUSES = new Set([
    invoice_entity_1.InvoiceStatus.DRAFT,
    invoice_entity_1.InvoiceStatus.ISSUED,
]);
const REUSABLE_TRANSACTION_STATUSES = new Set([
    payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
    payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING,
]);
const SUPERSEDABLE_TRANSACTION_STATUSES = new Set([
    payment_transaction_entity_1.PaymentTransactionStatus.FAILED,
    payment_transaction_entity_1.PaymentTransactionStatus.CANCELLED,
    payment_transaction_entity_1.PaymentTransactionStatus.REFUNDED,
]);
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
        const { userId, email, planId, provider: preferredProvider, ipAddress, idempotencyKey } = request;
        const currency = request.currency.toUpperCase();
        const countryCode = request.countryCode.toUpperCase();
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
        const existingSubscription = await this.subscriptionRepo.findOne({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
        if (existingSubscription?.subscriptionPlanId === planId &&
            this.isSubscriptionCurrentlyValid(existingSubscription)) {
            throw new common_1.ConflictException('You already have an active subscription for this plan — no new checkout is needed');
        }
        const paymentPurpose = this.determinePaymentPurpose(existingSubscription);
        if (idempotencyKey) {
            const replay = await this.handleIdempotencyKeyReplay({
                userId,
                planId,
                currency,
                countryCode,
                paymentPurpose,
                amountMinor: pricing.amountCents,
                preferredProvider,
                idempotencyKey,
                ipAddress,
            });
            if (replay)
                return replay;
        }
        let lookup = await this.findReusableCheckout(userId, planId, currency, countryCode, paymentPurpose);
        if (lookup.kind === 'blocked') {
            throw new common_1.ConflictException(lookup.reason);
        }
        if (lookup.kind === 'reuse' && lookup.invoice.totalAmount !== pricing.amountCents) {
            this.logger.warn(`[Checkout] Pending invoice ${lookup.invoice.id} amount ${lookup.invoice.totalAmount} no longer ` +
                `matches current price ${pricing.amountCents} — not reusing, creating a fresh checkout`);
            lookup = { kind: 'none' };
        }
        if (lookup.kind === 'reuse' && this.hasActiveProviderSession(lookup.transaction)) {
            if (preferredProvider && preferredProvider !== lookup.transaction.provider) {
                throw new common_1.ConflictException(`A checkout session is already in progress with ${lookup.transaction.provider}; ` +
                    `cannot switch to ${preferredProvider} while it is active`);
            }
            await this.auditService.log({
                actorUserId: userId,
                actorType: 'USER',
                action: audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_PROVIDER_SESSION_REUSED,
                resourceType: 'PaymentTransaction',
                resourceId: lookup.transaction.id,
                ipAddress,
                metadata: {
                    planId,
                    currency,
                    countryCode,
                    provider: lookup.transaction.provider,
                    invoiceId: lookup.invoice.id,
                },
                severity: audit_log_entity_1.AuditSeverity.INFO,
            });
            this.logger.log(`[Checkout] Reusing active ${lookup.transaction.provider} session: tx=${lookup.transaction.id}`);
            return this.toCheckoutResult(lookup.invoice, lookup.transaction, true, CheckoutReason.PROVIDER_SESSION_REUSED);
        }
        if (lookup.kind === 'reuse' &&
            preferredProvider &&
            lookup.transaction.provider !== 'manual' &&
            lookup.transaction.provider !== preferredProvider &&
            lookup.transaction.providerTransactionReference) {
            throw new common_1.ConflictException(`A checkout is already in progress with ${lookup.transaction.provider}; cannot switch provider ` +
                'while a provider session reference exists');
        }
        const providerHint = preferredProvider ??
            (lookup.kind === 'reuse' && lookup.transaction.provider !== 'manual'
                ? lookup.transaction.provider
                : undefined);
        const { provider, reason: routingReason } = await this.paymentRoutingService.routeForCheckout(countryCode, currency, providerHint);
        this.logger.log(`[Checkout] User ${userId}: plan=${planId}, provider=${provider.providerId}, reason=${routingReason}`);
        let invoice;
        let transaction;
        let isNewPair;
        if (lookup.kind === 'reuse') {
            invoice = lookup.invoice;
            transaction = lookup.transaction;
            isNewPair = false;
        }
        else {
            if (lookup.kind === 'supersede') {
                await this.supersedeInvoice(lookup.invoice, ipAddress);
            }
            const created = await this.createInvoiceAndTransaction({
                userId,
                planId,
                plan,
                pricing,
                currency,
                countryCode,
                paymentPurpose,
                provider: provider.providerId,
                ipAddress,
                idempotencyKey,
                preferredProvider,
            });
            invoice = created.invoice;
            transaction = created.transaction;
            isNewPair = created.isNewPair;
        }
        const claim = await this.transactionRepo.update({
            id: transaction.id,
            status: (0, typeorm_2.In)([payment_transaction_entity_1.PaymentTransactionStatus.PENDING, payment_transaction_entity_1.PaymentTransactionStatus.FAILED]),
        }, { status: payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING, provider: provider.providerId });
        if (!claim.affected) {
            const current = await this.transactionRepo.findOne({ where: { id: transaction.id } });
            if (current && this.hasActiveProviderSession(current)) {
                return this.toCheckoutResult(invoice, current, true, CheckoutReason.PROVIDER_SESSION_REUSED);
            }
            throw new common_1.ConflictException('A checkout session is already being created for this plan — please retry shortly');
        }
        transaction.status = payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING;
        transaction.provider = provider.providerId;
        const sessionRequest = {
            userId,
            email,
            planId,
            currency,
            amountMinor: Number(pricing.amountCents),
            countryCode,
            invoiceId: invoice.id,
            metadata: {
                transactionId: transaction.id,
                invoiceId: invoice.id,
                planId,
            },
        };
        let sessionResult;
        try {
            sessionResult = await provider.createCheckoutSession(sessionRequest);
        }
        catch (err) {
            await this.transactionRepo.update(transaction.id, {
                status: payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
                failureMessage: 'Checkout session creation failed',
            });
            await this.auditService.log({
                actorUserId: userId,
                actorType: 'USER',
                action: audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_FAILED,
                resourceType: 'PaymentTransaction',
                resourceId: transaction.id,
                ipAddress,
                metadata: { planId, currency, countryCode, provider: provider.providerId },
                severity: audit_log_entity_1.AuditSeverity.WARNING,
            });
            const message = err instanceof Error ? err.message : 'Checkout unavailable';
            throw new common_1.BadRequestException(`Payment checkout failed: ${message}`);
        }
        try {
            await this.transactionRepo.update(transaction.id, {
                providerTransactionReference: sessionResult.providerTransactionReference ?? sessionResult.sessionId,
                providerPayloadSummary: { sessionId: sessionResult.sessionId, checkoutUrl: sessionResult.checkoutUrl, provider: provider.providerId, planId },
            });
        }
        catch (err) {
            if (!this.isUniqueViolation(err))
                throw err;
            await this.transactionRepo.update(transaction.id, {
                status: payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
                failureMessage: 'Provider session reference conflict — please retry',
            });
            await this.auditService.log({
                actorUserId: userId,
                actorType: 'USER',
                action: audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_FAILED,
                resourceType: 'PaymentTransaction',
                resourceId: transaction.id,
                ipAddress,
                metadata: {
                    planId,
                    currency,
                    countryCode,
                    provider: provider.providerId,
                    reason: 'PROVIDER_REFERENCE_CONFLICT',
                },
                severity: audit_log_entity_1.AuditSeverity.CRITICAL,
            });
            throw new common_1.ConflictException('Payment checkout failed: a conflicting payment session was detected — please retry shortly');
        }
        await this.auditService.log({
            actorUserId: userId,
            actorType: 'USER',
            action: isNewPair ? audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_INITIATED : audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_REUSED,
            resourceType: 'PaymentTransaction',
            resourceId: transaction.id,
            ipAddress,
            metadata: {
                planId,
                planName: plan.name,
                currency,
                countryCode,
                provider: provider.providerId,
                invoiceId: invoice.id,
                amountMinor: pricing.amountCents,
                routingReason,
                reused: !isNewPair,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[Checkout] Session created: tx=${transaction.id}, invoice=${invoice.id}, provider=${provider.providerId}, reused=${!isNewPair}`);
        return {
            invoiceId: invoice.id,
            transactionId: transaction.id,
            provider: provider.providerId,
            providerTransactionReference: sessionResult.providerTransactionReference ?? sessionResult.sessionId,
            checkoutUrl: sessionResult.checkoutUrl,
            sessionId: sessionResult.sessionId,
            requiresRedirect: !!sessionResult.checkoutUrl,
            status: payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING,
            reused: !isNewPair,
            reason: isNewPair ? CheckoutReason.NEW_CHECKOUT : CheckoutReason.REUSED_PENDING_CHECKOUT,
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
    isSubscriptionCurrentlyValid(subscription) {
        const now = new Date();
        if (subscription.status === user_subscription_entity_1.SubscriptionStatus.ACTIVE) {
            return subscription.currentPeriodEnd != null && now < subscription.currentPeriodEnd;
        }
        if (subscription.status === user_subscription_entity_1.SubscriptionStatus.TRIAL) {
            return subscription.trialEndsAt != null && now < subscription.trialEndsAt;
        }
        return false;
    }
    determinePaymentPurpose(existingSubscription) {
        if (!existingSubscription || existingSubscription.status === user_subscription_entity_1.SubscriptionStatus.TRIAL) {
            return payment_transaction_entity_1.PaymentPurpose.SUBSCRIPTION_INITIAL;
        }
        return payment_transaction_entity_1.PaymentPurpose.SUBSCRIPTION_RENEWAL;
    }
    hasActiveProviderSession(transaction) {
        return (transaction.status === payment_transaction_entity_1.PaymentTransactionStatus.PROCESSING &&
            transaction.provider !== 'manual' &&
            !!transaction.providerTransactionReference);
    }
    async findReusableCheckout(userId, planId, currency, countryCode, paymentPurpose) {
        const invoice = await this.invoiceRepo
            .createQueryBuilder('i')
            .where('i.user_id = :userId', { userId })
            .andWhere('i.currency = :currency', { currency })
            .andWhere("i.metadata->>'planId' = :planId", { planId })
            .andWhere("i.metadata->>'countryCode' = :countryCode", { countryCode })
            .andWhere("i.metadata->>'type' = :type", { type: 'SUBSCRIPTION' })
            .andWhere("i.metadata->>'paymentPurpose' = :paymentPurpose", { paymentPurpose })
            .orderBy('i.created_at', 'DESC')
            .getOne();
        if (!invoice)
            return { kind: 'none' };
        if (invoice.status === invoice_entity_1.InvoiceStatus.PAID) {
            return { kind: 'blocked', reason: 'This subscription checkout has already been paid' };
        }
        if (!PENDING_INVOICE_STATUSES.has(invoice.status)) {
            return { kind: 'none' };
        }
        const transaction = await this.transactionRepo.findOne({
            where: { invoiceId: invoice.id },
            order: { createdAt: 'DESC' },
        });
        if (!transaction) {
            return { kind: 'supersede', invoice };
        }
        if (transaction.status === payment_transaction_entity_1.PaymentTransactionStatus.SUCCEEDED) {
            return { kind: 'blocked', reason: 'This subscription checkout has already been paid' };
        }
        if (REUSABLE_TRANSACTION_STATUSES.has(transaction.status)) {
            return { kind: 'reuse', invoice, transaction };
        }
        if (SUPERSEDABLE_TRANSACTION_STATUSES.has(transaction.status)) {
            return { kind: 'supersede', invoice };
        }
        return { kind: 'none' };
    }
    async supersedeInvoice(invoice, ipAddress) {
        await this.invoiceRepo.update(invoice.id, {
            status: invoice_entity_1.InvoiceStatus.CANCELLED,
            metadata: {
                ...(invoice.metadata ?? {}),
                supersededAt: new Date().toISOString(),
                supersededReason: 'Previous payment attempt failed/cancelled — replaced by a new checkout',
            },
        });
        this.logger.log(`[Checkout] Superseded stale invoice ${invoice.id} (previous attempt did not complete)`);
        void ipAddress;
    }
    async createInvoiceAndTransaction(params) {
        const { userId, planId, plan, pricing, currency, countryCode, paymentPurpose, provider, ipAddress, idempotencyKey, preferredProvider, } = params;
        const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
        const metadata = {
            type: 'SUBSCRIPTION',
            planId,
            planName: plan.name,
            countryCode,
            paymentPurpose,
        };
        if (idempotencyKey) {
            metadata.idempotencyKeyHash = this.hashIdempotencyKey(idempotencyKey);
            metadata.idempotencyFingerprint = this.hashIdempotencyFingerprint({
                userId,
                planId,
                currency,
                countryCode,
                paymentPurpose,
                amountMinor: pricing.amountCents,
                provider: preferredProvider ?? null,
            });
        }
        const invoiceEntity = this.invoiceRepo.create({
            userId,
            subscriptionId: null,
            invoiceNumber,
            status: invoice_entity_1.InvoiceStatus.DRAFT,
            currency,
            subtotalAmount: pricing.amountCents,
            taxAmount: '0',
            totalAmount: pricing.amountCents,
            dueDate: null,
            metadata,
        });
        let savedInvoice;
        try {
            savedInvoice = await this.invoiceRepo.save(invoiceEntity);
        }
        catch (err) {
            if (this.isUniqueViolation(err)) {
                this.logger.log(`[Checkout] Lost duplicate-invoice race for user ${userId}/plan ${planId} — reusing winner`);
                const winner = await this.findReusableCheckout(userId, planId, currency, countryCode, paymentPurpose);
                if (winner.kind === 'reuse') {
                    return { invoice: winner.invoice, transaction: winner.transaction, isNewPair: false };
                }
                if (winner.kind === 'blocked') {
                    throw new common_1.ConflictException(winner.reason);
                }
                this.logger.warn(`[Checkout] Duplicate-invoice race resolved but winner not yet reusable (kind=${winner.kind}) ` +
                    `for user ${userId}/plan ${planId} — asking caller to retry`);
                throw new common_1.ConflictException('A checkout session is already being created for this plan — please retry shortly');
            }
            throw err;
        }
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
        const transactionEntity = this.transactionRepo.create({
            userId,
            subscriptionId: null,
            invoiceId: savedInvoice.id,
            provider,
            paymentPurpose,
            status: payment_transaction_entity_1.PaymentTransactionStatus.PENDING,
            currency,
            amountMinor: pricing.amountCents,
            countryCode,
        });
        const savedTx = await this.transactionRepo.save(transactionEntity);
        return { invoice: savedInvoice, transaction: savedTx, isNewPair: true };
    }
    async handleIdempotencyKeyReplay(params) {
        const { userId, planId, currency, countryCode, paymentPurpose, amountMinor, preferredProvider, idempotencyKey, ipAddress, } = params;
        const keyHash = this.hashIdempotencyKey(idempotencyKey);
        const existing = await this.invoiceRepo
            .createQueryBuilder('i')
            .where('i.user_id = :userId', { userId })
            .andWhere("i.metadata->>'idempotencyKeyHash' = :keyHash", { keyHash })
            .orderBy('i.created_at', 'DESC')
            .getOne();
        if (!existing)
            return null;
        const expectedFingerprint = this.hashIdempotencyFingerprint({
            userId,
            planId,
            currency,
            countryCode,
            paymentPurpose,
            amountMinor,
            provider: preferredProvider ?? null,
        });
        const storedFingerprint = existing.metadata?.['idempotencyFingerprint'];
        if (storedFingerprint !== expectedFingerprint) {
            throw new common_1.ConflictException('This Idempotency-Key was already used with different checkout parameters');
        }
        const transaction = await this.transactionRepo.findOne({
            where: { invoiceId: existing.id },
            order: { createdAt: 'DESC' },
        });
        if (!transaction)
            return null;
        await this.auditService.log({
            actorUserId: userId,
            actorType: 'USER',
            action: audit_action_enum_1.AuditAction.PAYMENT_CHECKOUT_REUSED,
            resourceType: 'PaymentTransaction',
            resourceId: transaction.id,
            ipAddress,
            metadata: {
                planId,
                currency,
                countryCode,
                invoiceId: existing.id,
                reason: CheckoutReason.IDEMPOTENCY_KEY_REPLAY,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        return this.toCheckoutResult(existing, transaction, true, CheckoutReason.IDEMPOTENCY_KEY_REPLAY);
    }
    toCheckoutResult(invoice, transaction, reused, reason) {
        const summary = transaction.providerPayloadSummary ?? {};
        return {
            invoiceId: invoice.id,
            transactionId: transaction.id,
            provider: transaction.provider,
            providerTransactionReference: transaction.providerTransactionReference ?? undefined,
            checkoutUrl: summary['checkoutUrl'] ?? undefined,
            sessionId: summary['sessionId'] ?? undefined,
            requiresRedirect: !!summary['checkoutUrl'],
            status: transaction.status,
            reused,
            reason,
        };
    }
    isUniqueViolation(err) {
        return err instanceof typeorm_2.QueryFailedError && err.code === '23505';
    }
    hashIdempotencyKey(key) {
        return (0, crypto_1.createHash)('sha256').update(key).digest('hex');
    }
    hashIdempotencyFingerprint(params) {
        const payload = JSON.stringify({
            userId: params.userId,
            planId: params.planId,
            currency: params.currency,
            countryCode: params.countryCode,
            paymentPurpose: params.paymentPurpose,
            amountMinor: params.amountMinor,
            provider: params.provider ?? null,
        });
        return (0, crypto_1.createHash)('sha256').update(payload).digest('hex');
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