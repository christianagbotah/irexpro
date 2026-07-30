import { BadRequestException, forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { PaymentWebhookEvent } from '../entities/payment-webhook-event.entity';
import { PaymentTransaction, PaymentPurpose, PaymentTransactionStatus } from '../entities/payment-transaction.entity';
import { Invoice, InvoiceStatus } from '../entities/invoice.entity';
import { PerformanceFeeAssessment, AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';
import { PerformanceFeeLedgerEntry, LedgerEntryType } from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import { TradingAccountPerformance } from '../../performance-fees/entities/trading-account-performance.entity';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
import { PaymentEventType } from '../interfaces/payment-provider.interface';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../../common/enums/audit-action.enum';
import { AuditSeverity } from '../../audit/entities/audit-log.entity';
import { SubscriptionsService } from '../../subscriptions/subscriptions.service';
import { BillingInterval } from '../../subscriptions/entities/subscription-plan.entity';

export interface WebhookProcessResult {
  accepted: boolean;
  idempotent: boolean;
  message: string;
}

/**
 * Compute the subscription period end date from a start date and billing interval.
 * Supports MONTHLY, QUARTERLY, and ANNUAL. Unknown intervals fall back to MONTHLY.
 */
function computePeriodEnd(from: Date, billingInterval: BillingInterval): Date {
  const end = new Date(from);
  switch (billingInterval) {
    case BillingInterval.QUARTERLY:
      end.setMonth(end.getMonth() + 3);
      break;
    case BillingInterval.ANNUAL:
      end.setFullYear(end.getFullYear() + 1);
      break;
    case BillingInterval.MONTHLY:
    default:
      end.setMonth(end.getMonth() + 1);
  }
  return end;
}

/**
 * WebhookProcessorService
 *
 * Handles incoming payment provider webhooks safely:
 * 1. Verifies signature — REJECT if invalid.
 * 2. Stores webhook event for idempotency.
 * 3. Processes state changes (subscription activation, payment status updates).
 *
 * RULES:
 * - Never activate subscription without verified signature.
 * - Never double-process the same providerEventId.
 * - Never store raw payload — store payloadSummary only.
 * - All state changes are audit-logged.
 * - Billing period end is computed from plan.billingInterval (not hardcoded).
 * - Duplicate webhook with processed=true → idempotent success.
 * - Duplicate webhook with processed=false → safe retry.
 */
@Injectable()
export class WebhookProcessorService {
  private readonly logger = new Logger(WebhookProcessorService.name);

  constructor(
    private readonly registry: PaymentProviderRegistry,
    // PaymentsModule <-> SubscriptionsModule form a legitimate bidirectional
    // dependency (WebhookProcessorService needs SubscriptionsService to activate
    // subscriptions on payment; SubscriptionsService needs PaymentRoutingService).
    // forwardRef resolves the cycle at bootstrap.
    @Inject(forwardRef(() => SubscriptionsService))
    private readonly subscriptionsService: SubscriptionsService,
    private readonly auditService: AuditService,
    @InjectRepository(PaymentWebhookEvent)
    private readonly webhookEventRepo: Repository<PaymentWebhookEvent>,
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
    @InjectRepository(Invoice)
    private readonly invoiceRepo: Repository<Invoice>,
    @InjectRepository(PerformanceFeeAssessment)
    private readonly assessmentRepo: Repository<PerformanceFeeAssessment>,
    @InjectRepository(PerformanceFeeLedgerEntry)
    private readonly ledgerRepo: Repository<PerformanceFeeLedgerEntry>,
    @InjectRepository(TradingAccountPerformance)
    private readonly performanceRepo: Repository<TradingAccountPerformance>,
  ) {}

  async processWebhook(
    providerId: string,
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<WebhookProcessResult> {
    // The ManualPaymentProvider is DEV/TEST only and its signature check always
    // returns true. It must NEVER be reachable through the public webhook endpoint,
    // otherwise a forged request could be accepted as a verified webhook.
    if (providerId === 'manual') {
      throw new BadRequestException('Unknown payment provider');
    }

    const provider = this.registry.getProvider(providerId);

    // 1. Verify signature — fail closed
    const signatureVerified = provider.verifyWebhookSignature(rawBody, headers);

    await this.auditService.log({
      actorUserId: 'system',
      actorType: 'SYSTEM',
      action: AuditAction.PAYMENT_WEBHOOK_RECEIVED,
      resourceType: 'PaymentWebhookEvent',
      resourceId: providerId,
      metadata: { provider: providerId, signatureVerified },
      severity: AuditSeverity.INFO,
    });

    if (!signatureVerified) {
      await this.auditService.log({
        actorUserId: 'system',
        actorType: 'SYSTEM',
        action: AuditAction.PAYMENT_WEBHOOK_SIGNATURE_FAILED,
        resourceType: 'PaymentWebhookEvent',
        resourceId: providerId,
        metadata: { provider: providerId },
        severity: AuditSeverity.WARNING,
      });
      throw new BadRequestException('Webhook signature verification failed');
    }

    // 2. Parse event
    const event = provider.parseWebhookEvent(rawBody, headers);

    // Safe payload summary — never store secrets or card data
    const payloadSummary: Record<string, unknown> = {
      eventType: event.eventType,
      providerEventId: event.providerEventId,
      providerSubscriptionId: event.providerSubscriptionId,
      amountMinor: event.amountMinor,
      currency: event.currency,
    };

    // 3. Idempotency — store webhook event (unique constraint on provider+providerEventId)
    let webhookRecord: PaymentWebhookEvent;
    try {
      webhookRecord = this.webhookEventRepo.create({
        provider: providerId,
        providerEventId: event.providerEventId,
        eventType: event.eventType,
        signatureVerified: true,
        processed: false,
        payloadSummary,
        receivedAt: new Date(),
      });
      webhookRecord = await this.webhookEventRepo.save(webhookRecord);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === '23505') {
        // Duplicate event — check if the existing record was successfully processed
        const existing = await this.webhookEventRepo.findOne({
          where: { provider: providerId, providerEventId: event.providerEventId },
        });

        if (!existing) throw err;

        if (existing.processed) {
          // Already processed successfully → idempotent success, no reprocessing
          this.logger.log(
            `[Webhook] Idempotent (processed=true): event ${event.providerEventId} from ${providerId}`,
          );
          return { accepted: true, idempotent: true, message: 'Already processed' };
        }

        // processed=false — previous attempt had a transient failure; retry safely
        this.logger.log(
          `[Webhook] Retry (processed=false): event ${event.providerEventId} from ${providerId}`,
        );
        webhookRecord = existing;
        // Fall through to process
      } else {
        throw err;
      }
    }

    // 4. Process event
    try {
      await this.handleEvent(event, webhookRecord, providerId);
      await this.webhookEventRepo.update(webhookRecord.id, {
        processed: true,
        processedAt: new Date(),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Processing error';
      await this.webhookEventRepo.update(webhookRecord.id, {
        processingError: errorMessage,
      });
      this.logger.error(`[Webhook] Processing failed for event ${event.providerEventId}: ${errorMessage}`);
      // Return success to provider to prevent retries for non-retryable errors
      return { accepted: true, idempotent: false, message: 'Received but processing failed' };
    }

    return { accepted: true, idempotent: false, message: 'Processed' };
  }

  private async handleEvent(
    event: { eventType: PaymentEventType; providerEventId: string; providerSubscriptionId?: string; providerTransactionReference?: string; amountMinor?: number; currency?: string; metadata?: Record<string, unknown> },
    webhookRecord: PaymentWebhookEvent,
    providerId: string,
  ): Promise<void> {
    switch (event.eventType) {
      case PaymentEventType.PAYMENT_SUCCEEDED:
        await this.handlePaymentSucceeded(event, providerId);
        break;

      case PaymentEventType.PAYMENT_FAILED:
        await this.handlePaymentFailed(event, providerId);
        break;

      case PaymentEventType.SUBSCRIPTION_CANCELLED:
        await this.handleSubscriptionCancelled(event, providerId);
        break;

      case PaymentEventType.SUBSCRIPTION_RENEWED:
        await this.handlePaymentSucceeded(event, providerId);
        break;

      default:
        this.logger.log(`[Webhook] Unhandled event type: ${event.eventType} from ${providerId}`);
    }
  }

  private async handlePaymentSucceeded(
    event: { eventType: PaymentEventType; providerEventId: string; providerTransactionReference?: string; providerSubscriptionId?: string; amountMinor?: number; currency?: string; metadata?: Record<string, unknown> },
    providerId: string,
  ): Promise<void> {
    // Find matching pending transaction
    const transaction = event.providerTransactionReference
      ? await this.transactionRepo.findOne({
          where: { providerTransactionReference: event.providerTransactionReference, provider: providerId },
        })
      : null;

    if (!transaction) {
      this.logger.warn(
        `[Webhook] Payment succeeded but no matching transaction found: ref=${event.providerTransactionReference}, provider=${providerId}`,
      );
      return;
    }

    // Amount/currency verification — a webhook event that resolves to a known
    // transaction reference must still report the EXACT expected amount and
    // currency before the transaction is marked paid. Without this check, a
    // malformed/forged provider payload (or a provider-side data error) could
    // mark an under-paid, over-paid, or wrong-currency charge as fully paid,
    // activating a subscription or crediting a performance fee that was never
    // actually collected in full. This guard runs BEFORE any state change and
    // applies identically to subscription and performance-fee transactions.
    if (!this.amountAndCurrencyMatch(transaction, event)) {
      this.logger.error(
        `[Webhook] Amount/currency mismatch for tx ${transaction.id} (provider=${providerId}): ` +
          `expected ${transaction.amountMinor} ${transaction.currency}, received ` +
          `${event.amountMinor ?? 'undefined'} ${event.currency ?? 'undefined'} — NOT marking paid`,
      );
      await this.auditService.log({
        actorUserId: transaction.userId,
        actorType: 'SYSTEM',
        action: AuditAction.PAYMENT_FAILED,
        resourceType: 'PaymentTransaction',
        resourceId: transaction.id,
        metadata: {
          provider: providerId,
          reason: 'AMOUNT_OR_CURRENCY_MISMATCH',
          expectedAmountMinor: transaction.amountMinor,
          expectedCurrency: transaction.currency,
          receivedAmountMinor: event.amountMinor ?? null,
          receivedCurrency: event.currency ?? null,
        },
        severity: AuditSeverity.CRITICAL,
      });
      return;
    }

    await this.transactionRepo.update(transaction.id, {
      status: PaymentTransactionStatus.SUCCEEDED,
      providerPayloadSummary: {
        ...(transaction.providerPayloadSummary ?? {}),
        succeededAt: new Date().toISOString(),
        providerEventId: event.providerEventId,
      },
    });

    await this.auditService.log({
      actorUserId: transaction.userId,
      actorType: 'SYSTEM',
      action: AuditAction.PAYMENT_SUCCEEDED,
      resourceType: 'PaymentTransaction',
      resourceId: transaction.id,
      metadata: { provider: providerId, amountMinor: event.amountMinor, currency: event.currency },
      severity: AuditSeverity.INFO,
    });

    // Mark invoice paid
    if (transaction.invoiceId) {
      await this.invoiceRepo.update(transaction.invoiceId, {
        status: InvoiceStatus.PAID,
        paidAt: new Date(),
      });

      await this.auditService.log({
        actorUserId: transaction.userId,
        actorType: 'SYSTEM',
        action: AuditAction.INVOICE_PAID,
        resourceType: 'Invoice',
        resourceId: transaction.invoiceId,
        metadata: { provider: providerId, transactionId: transaction.id },
        severity: AuditSeverity.INFO,
      });
    }

    // Route post-payment logic by payment purpose
    if (transaction.paymentPurpose === PaymentPurpose.PERFORMANCE_FEE) {
      await this.handlePerformanceFeePaymentSucceeded(transaction, providerId);
    } else {
      await this.handleSubscriptionPaymentSucceeded(transaction, providerId, event);
    }
  }

  private async handleSubscriptionPaymentSucceeded(
    transaction: PaymentTransaction,
    providerId: string,
    event: { providerSubscriptionId?: string; providerEventId: string },
  ): Promise<void> {
    const now = new Date();

    // Load plan to determine the correct billing period end
    const planId = transaction.providerPayloadSummary?.planId as string | undefined ?? null;
    let periodEnd: Date;

    if (planId) {
      const plan = await this.subscriptionsService.getPlanById(planId);
      periodEnd = plan
        ? computePeriodEnd(now, plan.billingInterval)
        : computePeriodEnd(now, BillingInterval.MONTHLY);

      if (!plan) {
        this.logger.warn(
          `[Webhook] Plan ${planId} not found — defaulting period end to MONTHLY for tx ${transaction.id}`,
        );
      }
    } else {
      // No planId stored — safe fallback to monthly
      periodEnd = computePeriodEnd(now, BillingInterval.MONTHLY);
      this.logger.warn(
        `[Webhook] No planId in transaction ${transaction.id} providerPayloadSummary — defaulting period end to MONTHLY`,
      );
    }

    const subscription = await this.subscriptionsService.activateSubscriptionFromPayment(
      transaction.userId,
      planId,
      providerId,
      event.providerSubscriptionId ?? null,
      now,
      periodEnd,
    );

    await this.auditService.log({
      actorUserId: transaction.userId,
      actorType: 'SYSTEM',
      action: AuditAction.SUBSCRIPTION_ACTIVATED,
      resourceType: 'UserSubscription',
      resourceId: subscription.id,
      metadata: {
        provider: providerId,
        transactionId: transaction.id,
        planId,
        periodEnd: periodEnd.toISOString(),
      },
      severity: AuditSeverity.INFO,
    });
  }

  private async handlePerformanceFeePaymentSucceeded(
    transaction: PaymentTransaction,
    providerId: string,
  ): Promise<void> {
    if (!transaction.invoiceId) {
      this.logger.warn(`[Webhook] PERFORMANCE_FEE transaction ${transaction.id} has no invoiceId`);
      return;
    }

    const assessment = await this.assessmentRepo.findOne({
      where: { invoiceId: transaction.invoiceId },
    });

    if (!assessment) {
      this.logger.warn(
        `[Webhook] No assessment found for performance fee invoice ${transaction.invoiceId}`,
      );
      return;
    }

    if (assessment.status === AssessmentStatus.PAID) {
      this.logger.log(`[Webhook] Assessment ${assessment.id} already PAID — idempotent`);
      return;
    }

    // Mark assessment PAID
    await this.assessmentRepo.update(assessment.id, { status: AssessmentStatus.PAID });

    // Add FEE_PAID ledger entry
    await this.ledgerRepo.save({
      userId: transaction.userId,
      assessmentId: assessment.id,
      brokerConnectionId: assessment.brokerConnectionId,
      entryType: LedgerEntryType.FEE_PAID,
      currency: transaction.currency,
      amount: transaction.amountMinor,
      sourceReference: transaction.id,
      occurredAt: new Date(),
      metadata: {
        transactionId: transaction.id,
        invoiceId: transaction.invoiceId,
        provider: providerId,
      },
    });

    // Update HWM and total fees in TradingAccountPerformance.
    // Use IsNull() for the no-broker case — TypeORM strips `undefined`, which would
    // otherwise match ANY of the user's broker performance rows.
    const performance = await this.performanceRepo.findOne({
      where: {
        userId: transaction.userId,
        brokerConnectionId: assessment.brokerConnectionId === null ? IsNull() : assessment.brokerConnectionId,
      },
    });

    if (performance) {
      // Sprint 18 — HWM anti-regression hardening.
      //
      // The high-water mark represents the highest realised-balance peak ever
      // reached by this trading account. It must NEVER move downward — a
      // regression would allow the same profit to be charged a performance fee
      // twice in a later billing cycle.
      //
      // Previously this path assigned `currentHighWaterMark = endingRealisedBalance`
      // unconditionally. That was safe only because the billing-cycle orchestrator
      // refuses to create a second assessment while an outstanding (unpaid) one
      // exists against the current HWM — so in normal operation `endingRealisedBalance`
      // is always >= the stored HWM by the time a verified payment arrives.
      //
      // However, that safety is indirect and fragile: a future change to the
      // outstanding-assessment guard, a manually-inserted assessment, or a
      // reconciliation backfill that recomputes `endingRealisedBalance` could
      // silently let the HWM regress. We now enforce the invariant directly at
      // the single write site: `newHWM = max(oldHWM, endingRealisedBalance)`,
      // using BigInt comparison so no floating-point money math is introduced.
      const endingRealisedBalance = assessment.endingRealisedBalance;
      const oldHWM = performance.currentHighWaterMark;
      const newHWM = BigInt(endingRealisedBalance) > BigInt(oldHWM)
        ? endingRealisedBalance
        : oldHWM;
      const hwmRegulated = newHWM !== endingRealisedBalance;
      const newTotalFees = (BigInt(performance.totalFeesCharged) + BigInt(transaction.amountMinor)).toString();

      await this.performanceRepo.update(performance.id, {
        currentHighWaterMark: newHWM,
        totalFeesCharged: newTotalFees,
      });

      await this.auditService.log({
        actorUserId: transaction.userId,
        actorType: 'SYSTEM',
        action: AuditAction.HIGH_WATER_MARK_UPDATED,
        resourceType: 'TradingAccountPerformance',
        resourceId: performance.id,
        metadata: {
          userId: transaction.userId,
          oldHWM,
          newHWM,
          endingRealisedBalance,
          hwmRegulated,
          assessmentId: assessment.id,
          transactionId: transaction.id,
        },
        severity: AuditSeverity.INFO,
      });
    }

    await this.auditService.log({
      actorUserId: transaction.userId,
      actorType: 'SYSTEM',
      action: AuditAction.PERFORMANCE_FEE_PAID,
      resourceType: 'PerformanceFeeAssessment',
      resourceId: assessment.id,
      metadata: {
        userId: transaction.userId,
        invoiceId: transaction.invoiceId,
        transactionId: transaction.id,
        feeAmount: transaction.amountMinor,
        currency: transaction.currency,
        provider: providerId,
      },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(
      `[Webhook] PERFORMANCE_FEE paid: assessment=${assessment.id}, tx=${transaction.id}`,
    );
  }

  /**
   * True only when the webhook-reported amount and currency exactly match the
   * expected PaymentTransaction — using BigInt/string comparison, never floats.
   * Fails closed (returns false) when either side is missing/unparseable.
   */
  private amountAndCurrencyMatch(
    transaction: PaymentTransaction,
    event: { amountMinor?: number; currency?: string },
  ): boolean {
    if (event.amountMinor === undefined || event.currency === undefined) return false;
    if (!transaction.amountMinor || !transaction.currency) return false;

    let expectedAmount: bigint;
    let receivedAmount: bigint;
    try {
      expectedAmount = BigInt(transaction.amountMinor);
      // Provider amounts arrive as JS numbers; round defensively before BigInt().
      receivedAmount = BigInt(Math.round(event.amountMinor));
    } catch {
      return false;
    }
    if (expectedAmount !== receivedAmount) return false;

    return transaction.currency.trim().toUpperCase() === event.currency.trim().toUpperCase();
  }

  private async handlePaymentFailed(
    event: { eventType: PaymentEventType; providerEventId: string; providerTransactionReference?: string; metadata?: Record<string, unknown> },
    providerId: string,
  ): Promise<void> {
    const transaction = event.providerTransactionReference
      ? await this.transactionRepo.findOne({
          where: { providerTransactionReference: event.providerTransactionReference, provider: providerId },
        })
      : null;

    if (transaction) {
      await this.transactionRepo.update(transaction.id, {
        status: PaymentTransactionStatus.FAILED,
        failureMessage: 'Payment failed — see provider portal for details',
      });

      await this.auditService.log({
        actorUserId: transaction.userId,
        actorType: 'SYSTEM',
        action: AuditAction.PAYMENT_FAILED,
        resourceType: 'PaymentTransaction',
        resourceId: transaction.id,
        metadata: { provider: providerId },
        severity: AuditSeverity.WARNING,
      });
    }
  }

  private async handleSubscriptionCancelled(
    event: { eventType: PaymentEventType; providerEventId: string; metadata?: Record<string, unknown> },
    providerId: string,
  ): Promise<void> {
    this.logger.log(`[Webhook] Subscription cancelled by provider ${providerId}: event=${event.providerEventId}`);
    // Provider-level cancellation handling — subscription.cancelledAt will be set by admin review
    // or by a follow-up cancellation call from the subscriptions service
  }
}
