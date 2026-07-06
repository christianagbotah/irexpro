import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, QueryFailedError, Repository } from 'typeorm';
import { createHash } from 'crypto';
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
  /** Optional client idempotency key — see Sprint 16 PART C. Never logged/stored raw. */
  idempotencyKey?: string;
}

/** Why a checkout result was returned the way it was — never exposes secrets. */
export enum CheckoutReason {
  NEW_CHECKOUT = 'NEW_CHECKOUT',
  REUSED_PENDING_CHECKOUT = 'REUSED_PENDING_CHECKOUT',
  PROVIDER_SESSION_REUSED = 'PROVIDER_SESSION_REUSED',
  IDEMPOTENCY_KEY_REPLAY = 'IDEMPOTENCY_KEY_REPLAY',
}

export interface CheckoutResult {
  invoiceId: string;
  transactionId: string;
  provider: string;
  providerTransactionReference?: string;
  checkoutUrl?: string;
  sessionId?: string;
  requiresRedirect: boolean;
  status: PaymentTransactionStatus;
  /** True when this response reused an existing invoice/transaction/session instead of creating new ones. */
  reused: boolean;
  reason: CheckoutReason;
}

/** Outcome of searching for an existing checkout matching the requested identity. */
type ReusableCheckoutLookup =
  | { kind: 'blocked'; reason: string }
  | { kind: 'reuse'; invoice: Invoice; transaction: PaymentTransaction }
  | { kind: 'supersede'; invoice: Invoice }
  | { kind: 'none' };

const PENDING_INVOICE_STATUSES: ReadonlySet<InvoiceStatus> = new Set([
  InvoiceStatus.DRAFT,
  InvoiceStatus.ISSUED,
]);

const REUSABLE_TRANSACTION_STATUSES: ReadonlySet<PaymentTransactionStatus> = new Set([
  PaymentTransactionStatus.PENDING,
  PaymentTransactionStatus.PROCESSING,
]);

const SUPERSEDABLE_TRANSACTION_STATUSES: ReadonlySet<PaymentTransactionStatus> = new Set([
  PaymentTransactionStatus.FAILED,
  PaymentTransactionStatus.CANCELLED,
  PaymentTransactionStatus.REFUNDED,
]);

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

  async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
    return this.planRepo.findOne({ where: { id: planId } });
  }

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
   * Sprint 16 — Checkout Idempotency + Pending Invoice Reuse:
   *
   * 1. Validate plan + pricing.
   * 2. Block if the user already has a currently-valid ACTIVE/TRIAL subscription
   *    to this exact plan — never create a duplicate invoice/transaction for it.
   * 3. Optional Idempotency-Key replay — same key + same params returns the same
   *    invoice/transaction/session; same key + different params fails safely.
   * 4. Look for an existing DRAFT/ISSUED invoice + PENDING/PROCESSING transaction
   *    for the same (userId, planId, currency, countryCode) identity and reuse it
   *    instead of creating a new one. A PAID invoice always blocks new checkout.
   * 5. If the reused transaction already has an active provider session
   *    (PROCESSING + providerTransactionReference), return it directly — never
   *    create a second provider session.
   * 6. Otherwise atomically claim the transaction (conditional UPDATE) before
   *    calling the provider, so two concurrent requests can never both create a
   *    provider session for the same row.
   * 7. A DB-level partial unique index (see migration
   *    AddSubscriptionCheckoutDuplicateGuard) is the authoritative guard against
   *    two concurrent requests both creating a brand-new invoice for the same
   *    identity; a resulting 23505 is handled by re-reading and reusing the
   *    winning row instead of surfacing a raw DB error.
   *
   * RULES (never violated):
   * - ManualPaymentProvider is not allowed for public checkout.
   * - Frontend payment success alone NEVER activates subscription.
   * - Only verified webhooks activate subscription — checkout never does.
   */
  async initiateCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const { userId, email, planId, provider: preferredProvider, ipAddress, idempotencyKey } = request;
    const currency = request.currency.toUpperCase();
    const countryCode = request.countryCode.toUpperCase();

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

    // 3. Never checkout again for a plan the user already has a currently-valid subscription to.
    const existingSubscription = await this.subscriptionRepo.findOne({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (
      existingSubscription?.subscriptionPlanId === planId &&
      this.isSubscriptionCurrentlyValid(existingSubscription)
    ) {
      throw new ConflictException(
        'You already have an active subscription for this plan — no new checkout is needed',
      );
    }

    const paymentPurpose = this.determinePaymentPurpose(existingSubscription);

    // 4. Optional Idempotency-Key replay
    if (idempotencyKey) {
      const replay = await this.handleIdempotencyKeyReplay({
        userId,
        planId,
        currency,
        countryCode,
        preferredProvider,
        idempotencyKey,
        ipAddress,
      });
      if (replay) return replay;
    }

    // 5. Look for a reusable pending checkout for this exact identity
    let lookup = await this.findReusableCheckout(userId, planId, currency, countryCode, paymentPurpose);

    if (lookup.kind === 'blocked') {
      throw new ConflictException(lookup.reason);
    }

    // Amount mismatch (e.g. price changed since the pending invoice was created) —
    // never reuse a pending invoice/transaction whose amount no longer matches the
    // current price. The stale pending invoice is left untouched for manual review.
    if (lookup.kind === 'reuse' && lookup.invoice.totalAmount !== pricing.amountCents) {
      this.logger.warn(
        `[Checkout] Pending invoice ${lookup.invoice.id} amount ${lookup.invoice.totalAmount} no longer ` +
          `matches current price ${pricing.amountCents} — not reusing, creating a fresh checkout`,
      );
      lookup = { kind: 'none' };
    }

    // 6. An existing active provider session is returned as-is — never create a second session.
    if (lookup.kind === 'reuse' && this.hasActiveProviderSession(lookup.transaction)) {
      if (preferredProvider && preferredProvider !== lookup.transaction.provider) {
        throw new ConflictException(
          `A checkout session is already in progress with ${lookup.transaction.provider}; ` +
            `cannot switch to ${preferredProvider} while it is active`,
        );
      }

      await this.auditService.log({
        actorUserId: userId,
        actorType: 'USER',
        action: AuditAction.PAYMENT_CHECKOUT_PROVIDER_SESSION_REUSED,
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
        severity: AuditSeverity.INFO,
      });

      this.logger.log(
        `[Checkout] Reusing active ${lookup.transaction.provider} session: tx=${lookup.transaction.id}`,
      );
      return this.toCheckoutResult(
        lookup.invoice,
        lookup.transaction,
        true,
        CheckoutReason.PROVIDER_SESSION_REUSED,
      );
    }

    // Reject an explicit provider switch while a real session reference already exists.
    // (Reachable only if a transaction is PROCESSING/has a reference but somehow failed
    // the "active session" check above — e.g. a manual-provider row. Kept as a safety net.)
    if (
      lookup.kind === 'reuse' &&
      preferredProvider &&
      lookup.transaction.provider !== 'manual' &&
      lookup.transaction.provider !== preferredProvider &&
      lookup.transaction.providerTransactionReference
    ) {
      throw new ConflictException(
        `A checkout is already in progress with ${lookup.transaction.provider}; cannot switch provider ` +
          'while a provider session reference exists',
      );
    }

    // 7. Route provider. Hint with the requested/previously-assigned provider so a
    // retried PENDING transaction keeps using the same provider unless the caller
    // explicitly asked for a different one.
    const providerHint =
      preferredProvider ??
      (lookup.kind === 'reuse' && lookup.transaction.provider !== 'manual'
        ? lookup.transaction.provider
        : undefined);
    const { provider, reason: routingReason } = await this.paymentRoutingService.routeForCheckout(
      countryCode,
      currency,
      providerHint,
    );

    this.logger.log(
      `[Checkout] User ${userId}: plan=${planId}, provider=${provider.providerId}, reason=${routingReason}`,
    );

    let invoice: Invoice;
    let transaction: PaymentTransaction;
    let isNewPair: boolean;

    if (lookup.kind === 'reuse') {
      invoice = lookup.invoice;
      transaction = lookup.transaction;
      isNewPair = false;
    } else {
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

    // 8. Atomically claim the transaction BEFORE calling the provider. This prevents two
    // concurrent requests that both observed the same PENDING/FAILED transaction from both
    // calling the provider and racing to overwrite providerTransactionReference.
    const claim = await this.transactionRepo.update(
      {
        id: transaction.id,
        status: In([PaymentTransactionStatus.PENDING, PaymentTransactionStatus.FAILED]),
      } as FindOptionsWhere<PaymentTransaction>,
      { status: PaymentTransactionStatus.PROCESSING, provider: provider.providerId },
    );

    if (!claim.affected) {
      const current = await this.transactionRepo.findOne({ where: { id: transaction.id } });
      if (current && this.hasActiveProviderSession(current)) {
        return this.toCheckoutResult(invoice, current, true, CheckoutReason.PROVIDER_SESSION_REUSED);
      }
      throw new ConflictException(
        'A checkout session is already being created for this plan — please retry shortly',
      );
    }
    transaction.status = PaymentTransactionStatus.PROCESSING;
    transaction.provider = provider.providerId;

    // 9. Call provider.createCheckoutSession()
    const sessionRequest: CreateCheckoutSessionRequest = {
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
    } catch (err) {
      // Release the claim back to PENDING so the transaction remains recoverable for retry.
      // Never mark FAILED here — a transient provider outage must not force a brand-new
      // invoice on the next attempt.
      await this.transactionRepo.update(transaction.id, {
        status: PaymentTransactionStatus.PENDING,
        failureMessage: 'Checkout session creation failed',
      });

      await this.auditService.log({
        actorUserId: userId,
        actorType: 'USER',
        action: AuditAction.PAYMENT_CHECKOUT_FAILED,
        resourceType: 'PaymentTransaction',
        resourceId: transaction.id,
        ipAddress,
        metadata: { planId, currency, countryCode, provider: provider.providerId },
        severity: AuditSeverity.WARNING,
      });

      const message = err instanceof Error ? err.message : 'Checkout unavailable';
      throw new BadRequestException(`Payment checkout failed: ${message}`);
    }

    // Update transaction with provider reference; include planId so webhook handler can load billing interval
    await this.transactionRepo.update(transaction.id, {
      providerTransactionReference: sessionResult.providerTransactionReference ?? sessionResult.sessionId,
      providerPayloadSummary: { sessionId: sessionResult.sessionId, checkoutUrl: sessionResult.checkoutUrl, provider: provider.providerId, planId },
    });

    // 10. Audit log
    await this.auditService.log({
      actorUserId: userId,
      actorType: 'USER',
      action: isNewPair ? AuditAction.PAYMENT_CHECKOUT_INITIATED : AuditAction.PAYMENT_CHECKOUT_REUSED,
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
      severity: AuditSeverity.INFO,
    });

    this.logger.log(
      `[Checkout] Session created: tx=${transaction.id}, invoice=${invoice.id}, provider=${provider.providerId}, reused=${!isNewPair}`,
    );

    return {
      invoiceId: invoice.id,
      transactionId: transaction.id,
      provider: provider.providerId,
      providerTransactionReference: sessionResult.providerTransactionReference ?? sessionResult.sessionId,
      checkoutUrl: sessionResult.checkoutUrl,
      sessionId: sessionResult.sessionId,
      requiresRedirect: !!sessionResult.checkoutUrl,
      status: PaymentTransactionStatus.PROCESSING,
      reused: !isNewPair,
      reason: isNewPair ? CheckoutReason.NEW_CHECKOUT : CheckoutReason.REUSED_PENDING_CHECKOUT,
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

  // ─── Sprint 16 — reuse / idempotency helpers ──────────────────────────────

  /**
   * True when the subscription is ACTIVE (within its current period) or TRIAL
   * (within its trial window). Anything else (PAST_DUE, SUSPENDED, CANCELLED,
   * EXPIRED, or an expired ACTIVE/TRIAL) does not block a new checkout.
   */
  private isSubscriptionCurrentlyValid(subscription: UserSubscription): boolean {
    const now = new Date();
    if (subscription.status === SubscriptionStatus.ACTIVE) {
      return subscription.currentPeriodEnd != null && now < subscription.currentPeriodEnd;
    }
    if (subscription.status === SubscriptionStatus.TRIAL) {
      return subscription.trialEndsAt != null && now < subscription.trialEndsAt;
    }
    return false;
  }

  /**
   * SUBSCRIPTION_INITIAL for a user's first-ever subscription record (or one still
   * in TRIAL, which has never been paid); SUBSCRIPTION_RENEWAL once any prior
   * subscription record exists (ACTIVE/PAST_DUE/SUSPENDED/CANCELLED/EXPIRED).
   */
  private determinePaymentPurpose(existingSubscription: UserSubscription | null): PaymentPurpose {
    if (!existingSubscription || existingSubscription.status === SubscriptionStatus.TRIAL) {
      return PaymentPurpose.SUBSCRIPTION_INITIAL;
    }
    return PaymentPurpose.SUBSCRIPTION_RENEWAL;
  }

  /** True only for a PROCESSING transaction with a real (non-manual) active provider session. */
  private hasActiveProviderSession(transaction: PaymentTransaction): boolean {
    return (
      transaction.status === PaymentTransactionStatus.PROCESSING &&
      transaction.provider !== 'manual' &&
      !!transaction.providerTransactionReference
    );
  }

  /**
   * Finds the most recent invoice matching the exact checkout identity
   * (userId, planId, currency, countryCode) for subscription checkouts and
   * classifies it:
   * - PAID invoice / SUCCEEDED transaction → blocked (never re-checkout).
   * - DRAFT/ISSUED invoice with a PENDING/PROCESSING transaction → reuse.
   * - DRAFT/ISSUED invoice with a FAILED/CANCELLED/REFUNDED transaction (or no
   *   transaction at all) → supersede and let the caller create a fresh pair.
   * - Anything else (VOID/CANCELLED/OVERDUE invoice) → none, create a fresh pair.
   */
  private async findReusableCheckout(
    userId: string,
    planId: string,
    currency: string,
    countryCode: string,
    paymentPurpose: PaymentPurpose,
  ): Promise<ReusableCheckoutLookup> {
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

    if (!invoice) return { kind: 'none' };

    if (invoice.status === InvoiceStatus.PAID) {
      return { kind: 'blocked', reason: 'This subscription checkout has already been paid' };
    }

    if (!PENDING_INVOICE_STATUSES.has(invoice.status)) {
      // VOID / CANCELLED / OVERDUE — nothing usable, nothing to supersede.
      return { kind: 'none' };
    }

    const transaction = await this.transactionRepo.findOne({
      where: { invoiceId: invoice.id },
      order: { createdAt: 'DESC' },
    });

    if (!transaction) {
      // Data inconsistency safety net (orphaned DRAFT/ISSUED invoice, no transaction row).
      return { kind: 'supersede', invoice };
    }

    if (transaction.status === PaymentTransactionStatus.SUCCEEDED) {
      return { kind: 'blocked', reason: 'This subscription checkout has already been paid' };
    }

    if (REUSABLE_TRANSACTION_STATUSES.has(transaction.status)) {
      return { kind: 'reuse', invoice, transaction };
    }

    // FAILED / CANCELLED / REFUNDED — documented behavior: supersede the invoice and
    // let the caller create a brand-new invoice/transaction pair for a fresh attempt.
    if (SUPERSEDABLE_TRANSACTION_STATUSES.has(transaction.status)) {
      return { kind: 'supersede', invoice };
    }

    return { kind: 'none' };
  }

  private async supersedeInvoice(invoice: Invoice, ipAddress?: string): Promise<void> {
    await this.invoiceRepo.update(invoice.id, {
      status: InvoiceStatus.CANCELLED,
      metadata: {
        ...(invoice.metadata ?? {}),
        supersededAt: new Date().toISOString(),
        supersededReason: 'Previous payment attempt failed/cancelled — replaced by a new checkout',
      },
    });
    this.logger.log(`[Checkout] Superseded stale invoice ${invoice.id} (previous attempt did not complete)`);
    void ipAddress; // reserved for future audit-trail linkage
  }

  private async createInvoiceAndTransaction(params: {
    userId: string;
    planId: string;
    plan: SubscriptionPlan;
    pricing: PlanPricing;
    currency: string;
    countryCode: string;
    paymentPurpose: PaymentPurpose;
    provider: string;
    ipAddress?: string;
    idempotencyKey?: string;
    preferredProvider?: string;
  }): Promise<{ invoice: Invoice; transaction: PaymentTransaction; isNewPair: boolean }> {
    const {
      userId,
      planId,
      plan,
      pricing,
      currency,
      countryCode,
      paymentPurpose,
      provider,
      ipAddress,
      idempotencyKey,
      preferredProvider,
    } = params;

    const invoiceNumber = `INV-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const metadata: Record<string, unknown> = {
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
        provider: preferredProvider ?? null,
      });
    }

    const invoiceEntity = this.invoiceRepo.create({
      userId,
      subscriptionId: null,
      invoiceNumber,
      status: InvoiceStatus.DRAFT,
      currency,
      subtotalAmount: pricing.amountCents,
      taxAmount: '0',
      totalAmount: pricing.amountCents,
      dueDate: null,
      metadata,
    });

    let savedInvoice: Invoice;
    try {
      savedInvoice = await this.invoiceRepo.save(invoiceEntity);
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        // Lost the create race to a concurrent request for the same identity — the DB
        // partial unique index (AddSubscriptionCheckoutDuplicateGuard) rejected our
        // insert. Re-read and reuse whichever invoice/transaction won the race instead
        // of surfacing a raw database error or creating an orphaned transaction.
        this.logger.log(
          `[Checkout] Lost duplicate-invoice race for user ${userId}/plan ${planId} — reusing winner`,
        );
        const winner = await this.findReusableCheckout(userId, planId, currency, countryCode, paymentPurpose);
        if (winner.kind === 'reuse') {
          return { invoice: winner.invoice, transaction: winner.transaction, isNewPair: false };
        }
        if (winner.kind === 'blocked') {
          throw new ConflictException(winner.reason);
        }
      }
      throw err;
    }

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

    const transactionEntity = this.transactionRepo.create({
      userId,
      subscriptionId: null,
      invoiceId: savedInvoice.id,
      provider,
      paymentPurpose,
      status: PaymentTransactionStatus.PENDING,
      currency,
      amountMinor: pricing.amountCents,
      countryCode,
    });
    const savedTx = await this.transactionRepo.save(transactionEntity);

    return { invoice: savedInvoice, transaction: savedTx, isNewPair: true };
  }

  /**
   * Optional client Idempotency-Key handling (Sprint 16 PART C). No schema
   * change — the key is hashed (never stored raw) and kept, along with a
   * fingerprint of the checkout parameters, in the existing Invoice.metadata
   * JSONB column. Same key + same params → same result, replayed safely with
   * no new provider session or invoice/transaction. Same key + different
   * params → fails closed with ConflictException.
   */
  private async handleIdempotencyKeyReplay(params: {
    userId: string;
    planId: string;
    currency: string;
    countryCode: string;
    preferredProvider?: string;
    idempotencyKey: string;
    ipAddress?: string;
  }): Promise<CheckoutResult | null> {
    const { userId, planId, currency, countryCode, preferredProvider, idempotencyKey, ipAddress } = params;
    const keyHash = this.hashIdempotencyKey(idempotencyKey);

    const existing = await this.invoiceRepo
      .createQueryBuilder('i')
      .where('i.user_id = :userId', { userId })
      .andWhere("i.metadata->>'idempotencyKeyHash' = :keyHash", { keyHash })
      .orderBy('i.created_at', 'DESC')
      .getOne();

    if (!existing) return null;

    const expectedFingerprint = this.hashIdempotencyFingerprint({
      userId,
      planId,
      currency,
      countryCode,
      provider: preferredProvider ?? null,
    });
    const storedFingerprint = existing.metadata?.['idempotencyFingerprint'];

    if (storedFingerprint !== expectedFingerprint) {
      throw new ConflictException(
        'This Idempotency-Key was already used with different checkout parameters',
      );
    }

    const transaction = await this.transactionRepo.findOne({
      where: { invoiceId: existing.id },
      order: { createdAt: 'DESC' },
    });
    if (!transaction) return null;

    await this.auditService.log({
      actorUserId: userId,
      actorType: 'USER',
      action: AuditAction.PAYMENT_CHECKOUT_REUSED,
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
      severity: AuditSeverity.INFO,
    });

    return this.toCheckoutResult(existing, transaction, true, CheckoutReason.IDEMPOTENCY_KEY_REPLAY);
  }

  private toCheckoutResult(
    invoice: Invoice,
    transaction: PaymentTransaction,
    reused: boolean,
    reason: CheckoutReason,
  ): CheckoutResult {
    const summary = transaction.providerPayloadSummary ?? {};
    return {
      invoiceId: invoice.id,
      transactionId: transaction.id,
      provider: transaction.provider,
      providerTransactionReference: transaction.providerTransactionReference ?? undefined,
      checkoutUrl: (summary['checkoutUrl'] as string | undefined) ?? undefined,
      sessionId: (summary['sessionId'] as string | undefined) ?? undefined,
      requiresRedirect: !!summary['checkoutUrl'],
      status: transaction.status,
      reused,
      reason,
    };
  }

  private isUniqueViolation(err: unknown): boolean {
    return err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505';
  }

  /** SHA-256 hash of the client-supplied idempotency key. The raw key is never persisted. */
  private hashIdempotencyKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /** SHA-256 fingerprint of the checkout parameters an idempotency key was used with. */
  private hashIdempotencyFingerprint(params: {
    userId: string;
    planId: string;
    currency: string;
    countryCode: string;
    provider: string | null;
  }): string {
    const payload = JSON.stringify({
      userId: params.userId,
      planId: params.planId,
      currency: params.currency,
      countryCode: params.countryCode,
      provider: params.provider ?? null,
    });
    return createHash('sha256').update(payload).digest('hex');
  }
}
