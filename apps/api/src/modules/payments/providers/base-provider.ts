import { NotImplementedException } from '@nestjs/common';
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

/**
 * BasePaymentProvider — Fail-closed placeholder base for all live providers.
 *
 * All live methods throw NotImplementedException until the provider is fully implemented.
 * Providers must override methods as they become available.
 *
 * RULE: fail closed — missing credentials must throw ProviderNotConfiguredException.
 * RULE: never return sensitive provider data in error messages.
 */
export abstract class BasePaymentProvider implements IPaymentProvider {
  abstract readonly providerId: string;
  abstract readonly displayName: string;
  abstract readonly supportedCountries: string[];
  abstract readonly supportedCurrencies: string[];
  readonly isLive: boolean = false;
  readonly supportedPaymentMethods: string[] = ['card'];

  async createCustomer(_params: CreateCustomerParams): Promise<ProviderCustomerResult> {
    throw new NotImplementedException(`${this.displayName}: createCustomer is not yet implemented`);
  }

  async createCheckoutSession(
    _request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResult> {
    throw new NotImplementedException(
      `${this.displayName}: createCheckoutSession is not yet implemented`,
    );
  }

  verifyWebhookSignature(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): boolean {
    // Fail closed — placeholder providers reject all webhooks
    return false;
  }

  parseWebhookEvent(
    _rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    return { eventType: PaymentEventType.UNKNOWN, providerEventId: 'placeholder' };
  }

  async getTransactionStatus(
    _providerReference: string,
  ): Promise<PaymentProviderTransactionStatus> {
    throw new NotImplementedException(
      `${this.displayName}: getTransactionStatus is not yet implemented`,
    );
  }

  async cancelSubscription(_providerSubscriptionReference: string): Promise<void> {
    throw new NotImplementedException(
      `${this.displayName}: cancelSubscription is not yet implemented`,
    );
  }

  async refundPayment(_providerReference: string, _amountMinor?: number): Promise<void> {
    throw new NotImplementedException(`${this.displayName}: refundPayment is not yet implemented`);
  }

  // ─── Deprecated compat methods ────────────────────────────────────────────

  async createSubscription(_params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult> {
    throw new NotImplementedException(
      `${this.displayName}: createSubscription is not yet implemented`,
    );
  }

  async createPaymentIntent(
    _params: CreatePaymentIntentParams,
  ): Promise<ProviderPaymentIntentResult> {
    throw new NotImplementedException(
      `${this.displayName}: createPaymentIntent is not yet implemented`,
    );
  }

  validateWebhookSignature(_rawBody: Buffer, _signature: string): boolean {
    return false;
  }
}
