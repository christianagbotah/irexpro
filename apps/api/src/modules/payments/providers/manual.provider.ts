import { Injectable, Logger } from '@nestjs/common';
import {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResult,
  CreateCustomerParams,
  CreatePaymentIntentParams,
  CreateSubscriptionParams,
  IPaymentProvider,
  PaymentEventType,
  PaymentProviderTransactionStatus,
  ProviderCustomerResult,
  ProviderPaymentIntentResult,
  ProviderSubscriptionResult,
  ProviderWebhookEvent,
} from '../interfaces/payment-provider.interface';
import { v4 as uuidv4 } from 'uuid';

/**
 * ManualPaymentProvider — DEVELOPMENT AND TESTING ONLY.
 *
 * This provider simulates payment operations without contacting any payment gateway.
 * It is intended EXCLUSIVELY for:
 *   - Local development and testing
 *   - Internal QA subscription state testing
 *   - Admin-supervised pilot user onboarding
 *
 * NEVER use this provider for commercial subscriptions of real paying customers.
 * All activations through this provider are flagged in audit logs.
 *
 * See: docs/architecture/13-subscription-and-profit-sharing.md §2
 */
@Injectable()
export class ManualPaymentProvider implements IPaymentProvider {
  private readonly logger = new Logger(ManualPaymentProvider.name);

  readonly providerId = 'manual';
  readonly displayName = 'Manual (DEV/TEST ONLY)';
  readonly supportedCountries = ['*'];
  readonly supportedCurrencies = ['*'];
  readonly isLive = false;
  readonly supportedPaymentMethods = ['manual'];

  async createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult> {
    this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createCustomer called for user ${params.userId}`);
    return {
      providerCustomerId: `manual_cust_${uuidv4()}`,
      provider: this.providerId,
    };
  }

  async createCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResult> {
    this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createCheckoutSession for user ${request.userId}`);
    const sessionId = `manual_session_${uuidv4()}`;
    return {
      sessionId,
      checkoutUrl: undefined,
      providerTransactionReference: sessionId,
      provider: this.providerId,
    };
  }

  verifyWebhookSignature(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): boolean {
    this.logger.warn('[DEV/TEST] ManualPaymentProvider.verifyWebhookSignature — always true in dev');
    return true;
  }

  parseWebhookEvent(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    return {
      eventType: PaymentEventType.PAYMENT_SUCCEEDED,
      providerEventId: `manual_evt_${uuidv4()}`,
    };
  }

  async getTransactionStatus(providerReference: string): Promise<PaymentProviderTransactionStatus> {
    this.logger.warn(`[DEV/TEST] ManualPaymentProvider.getTransactionStatus: ${providerReference}`);
    return {
      providerReference,
      status: 'SUCCEEDED',
      paidAt: new Date(),
    };
  }

  async cancelSubscription(providerSubscriptionId: string): Promise<void> {
    this.logger.warn(`[DEV/TEST] ManualPaymentProvider.cancelSubscription: ${providerSubscriptionId}`);
  }

  async refundPayment(providerReference: string, _amountMinor?: number): Promise<void> {
    this.logger.warn(`[DEV/TEST] ManualPaymentProvider.refundPayment: ${providerReference}`);
  }

  // ─── Deprecated compat methods ────────────────────────────────────────────

  async createSubscription(_params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult> {
    this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createSubscription called`);
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    return {
      providerSubscriptionId: `manual_sub_${uuidv4()}`,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: end,
    };
  }

  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult> {
    this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createPaymentIntent: ${params.amountCents} ${params.currency}`);
    return {
      providerPaymentIntentId: `manual_pi_${uuidv4()}`,
      status: 'succeeded',
    };
  }

  validateWebhookSignature(_rawBody: Buffer, _signature: string): boolean {
    this.logger.warn('[DEV/TEST] ManualPaymentProvider.validateWebhookSignature — always true in dev');
    return true;
  }
}
