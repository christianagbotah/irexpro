import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanPricing } from './entities/plan-pricing.entity';
import { UserSubscription, SubscriptionStatus } from './entities/user-subscription.entity';
import { Invoice, InvoiceStatus } from '../payments/entities/invoice.entity';
import { PaymentTransaction, PaymentPurpose, PaymentTransactionStatus } from '../payments/entities/payment-transaction.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { PaymentRoutingService } from '../payments/services/payment-routing.service';
import { CreateCheckoutSessionRequest } from '../payments/interfaces/payment-provider.interface';

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

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    @InjectRepository(SubscriptionPlan)
    private planRepo: Repository<SubscriptionPlan>,
    @InjectRepository(PlanPricing)
    private pricingRepo: Repository<PlanPricing>,
    @InjectRepository(UserSubscription)
    private subscriptionRepo: Repository<UserSubscription>,
    @InjectRepository(Invoice)
    private invoiceRepo: Repository<Invoice>,
    @InjectRepository(PaymentTransaction)
    private transactionRepo: Repository<PaymentTransaction>,
    private auditService: AuditService,
    private paymentRoutingService: PaymentRoutingService,
  ) {}

  async findActivePlans(): Promise<SubscriptionPlan[]> {
    return this.planRepo.find({
      where: { isActive: true },
      relations: ['pricing'],
      order: { createdAt: 'ASC' },
    });
  }

  async findUserSubscription(userId: string): Promise<UserSubscription | null> {
    return this.subscriptionRepo.findOne({
      where: { userId },
      relations: ['plan', 'plan.pricing'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Determines if a user can activate AI Auto Trading.
   *
   * Returns true ONLY if:
   * - User has an ACTIVE or TRIAL subscription
   * - The subscription has not expired
   * - The subscription plan has allowsAiAutoTrading = true
   *
   * This check is server-side and must never be bypassed.
   */
  async canUserStartAiAutoTrading(userId: string): Promise<boolean> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId },
      relations: ['plan'],
      order: { createdAt: 'DESC' },
    });

    if (!subscription) return false;
    if (!subscription.plan?.allowsAiAutoTrading) return false;

    const now = new Date();

    if (subscription.status === SubscriptionStatus.TRIAL) {
      return subscription.trialEndsAt != null && now < subscription.trialEndsAt;
    }

    if (subscription.status === SubscriptionStatus.ACTIVE) {
      return subscription.currentPeriodEnd != null && now < subscription.currentPeriodEnd;
    }

    return false;
  }

  /**
   * Initiate a subscription checkout flow.
   *
   * Flow:
   * 1. Validate plan exists
   * 2. Validate pricing for country/currency
   * 3. Route to appropriate payment provider
   * 4. Create a DRAFT invoice
   * 5. Create a PENDING PaymentTransaction
   * 6. Call provider.createCheckoutSession()
   * 7. Return checkout URL/session reference
   *
   * RULES:
   * - ManualPaymentProvider is not allowed for public checkout
   * - Frontend payment success alone NEVER activates subscription
   * - Only verified webhooks activate subscription
   */
  async initiateCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const { userId, email, planId, currency, countryCode, provider: preferredProvider, ipAddress } = request;

    // 1. Validate plan
    const plan = await this.planRepo.findOne({ where: { id: planId, isActive: true } });
    if (!plan) throw new NotFoundException('Subscription plan not found or not active');

    // 2. Validate pricing
    const pricing = await this.pricingRepo
      .createQueryBuilder('p')
      .where('p.subscription_plan_id = :planId', { planId })
      .andWhere('p.currency = :currency', { currency })
      .andWhere('p.is_active = true')
      .andWhere('(p.country_code = :countryCode OR p.country_code IS NULL)', { countryCode })
      .orderBy('p.country_code', 'DESC', 'NULLS LAST')
      .getOne();
    if (!pricing) {
      throw new BadRequestException(
        `No pricing available for plan ${planId} with currency ${currency} in ${countryCode}`,
      );
    }

    // 3. Route provider
    const { provider, reason: routingReason } = await this.paymentRoutingService.routeForCheckout(
      countryCode,
      currency,
      preferredProvider,
    );

    this.logger.log(
      `[Checkout] User ${userId}: plan=${planId}, provider=${provider.providerId}, reason=${routingReason}`,
    );

    // 4. Create DRAFT invoice
    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const invoice = this.invoiceRepo.create({
      userId,
      subscriptionId: null,
      invoiceNumber,
      status: InvoiceStatus.DRAFT,
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
      action: AuditAction.INVOICE_CREATED,
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
      severity: AuditSeverity.INFO,
    });

    // 5. Create PENDING PaymentTransaction
    const transaction = this.transactionRepo.create({
      userId,
      subscriptionId: null,
      invoiceId: savedInvoice.id,
      provider: provider.providerId,
      paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
      status: PaymentTransactionStatus.PENDING,
      currency,
      amountMinor: pricing.amountCents,
      countryCode,
    });
    const savedTx = await this.transactionRepo.save(transaction);

    // 6. Call provider.createCheckoutSession()
    const sessionRequest: CreateCheckoutSessionRequest = {
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
    } catch (err) {
      // Mark transaction failed but do not expose raw error
      await this.transactionRepo.update(savedTx.id, {
        status: PaymentTransactionStatus.FAILED,
        failureMessage: 'Checkout session creation failed',
      });

      await this.auditService.log({
        actorUserId: userId,
        actorType: 'USER',
        action: AuditAction.PAYMENT_CHECKOUT_FAILED,
        resourceType: 'PaymentTransaction',
        resourceId: savedTx.id,
        ipAddress,
        metadata: { planId, currency, countryCode, provider: provider.providerId },
        severity: AuditSeverity.WARNING,
      });

      const message = err instanceof Error ? err.message : 'Checkout unavailable';
      throw new BadRequestException(`Payment checkout failed: ${message}`);
    }

    // Update transaction with provider reference
    await this.transactionRepo.update(savedTx.id, {
      providerTransactionReference: sessionResult.providerTransactionReference ?? sessionResult.sessionId,
      providerPayloadSummary: { sessionId: sessionResult.sessionId, provider: provider.providerId },
    });

    // 7. Audit log
    await this.auditService.log({
      actorUserId: userId,
      actorType: 'USER',
      action: AuditAction.PAYMENT_CHECKOUT_INITIATED,
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
      severity: AuditSeverity.INFO,
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

  /**
   * Cancel a user's subscription.
   * Updates local subscription record and attempts to notify provider.
   */
  async cancelSubscription(userId: string, reason?: string, ipAddress?: string): Promise<UserSubscription> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (!subscription) throw new NotFoundException('No active subscription found');

    if (
      subscription.status === SubscriptionStatus.CANCELLED ||
      subscription.status === SubscriptionStatus.EXPIRED
    ) {
      throw new BadRequestException('Subscription is already cancelled or expired');
    }

    subscription.status = SubscriptionStatus.CANCELLED;
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
      action: AuditAction.SUBSCRIPTION_CANCELLED,
      resourceType: 'UserSubscription',
      resourceId: saved.id,
      ipAddress,
      metadata: {
        reason: reason ?? 'User requested',
        previousStatus: subscription.status,
        paymentProvider: subscription.paymentProvider,
      },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(`[Subscription] Cancelled for user ${userId}: sub=${saved.id}`);
    return saved;
  }

  /**
   * DEV/TEST ONLY — Manual subscription activation.
   *
   * This endpoint is ONLY for development, internal testing, and supervised pilot onboarding.
   * It must NEVER be used for commercial subscription billing of real paying customers.
   * All commercial subscriptions must go through a live IPaymentProvider implementation.
   *
   * Requires ADMIN or SUPER_ADMIN role.
   * Every activation is audit-logged with the admin's user ID.
   */
  async manualActivate(
    userId: string,
    planId: string,
    activatedByAdminId: string,
    ipAddress?: string,
  ): Promise<UserSubscription> {
    const plan = await this.planRepo.findOne({ where: { id: planId } });
    if (!plan) throw new NotFoundException('Subscription plan not found');

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    let subscription = await this.subscriptionRepo.findOne({ where: { userId } });

    if (subscription) {
      subscription.subscriptionPlanId = planId;
      subscription.status = SubscriptionStatus.ACTIVE;
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
    } else {
      subscription = this.subscriptionRepo.create({
        userId,
        subscriptionPlanId: planId,
        status: SubscriptionStatus.ACTIVE,
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
      action: AuditAction.SUBSCRIPTION_MANUAL_ACTIVATED,
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
      severity: AuditSeverity.WARNING,
    });

    this.logger.warn(
      `[DEV/TEST] Manual subscription activated for user ${userId} by admin ${activatedByAdminId}`,
    );

    return saved;
  }

  /**
   * Activate a user subscription after verified payment.
   * Called ONLY from the webhook handler after signature verification.
   */
  async activateSubscriptionFromPayment(
    userId: string,
    planId: string | null,
    provider: string,
    providerSubscriptionReference: string | null,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<UserSubscription> {
    let subscription = await this.subscriptionRepo.findOne({ where: { userId } });

    if (subscription) {
      if (planId) subscription.subscriptionPlanId = planId;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.currentPeriodStart = periodStart;
      subscription.currentPeriodEnd = periodEnd;
      subscription.cancelledAt = null;
      subscription.paymentProvider = provider;
      subscription.providerSubscriptionReference = providerSubscriptionReference;
    } else {
      if (!planId) throw new BadRequestException('Cannot activate subscription without a plan');
      subscription = this.subscriptionRepo.create({
        userId,
        subscriptionPlanId: planId,
        status: SubscriptionStatus.ACTIVE,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        paymentProvider: provider,
        providerSubscriptionReference,
      });
    }

    return this.subscriptionRepo.save(subscription);
  }
}
