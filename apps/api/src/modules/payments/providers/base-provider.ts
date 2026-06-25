import { NotImplementedException } from '@nestjs/common';
import {
  CreateCustomerParams,
  CreatePaymentIntentParams,
  CreateSubscriptionParams,
  IPaymentProvider,
  ProviderCustomerResult,
  ProviderPaymentIntentResult,
  ProviderSubscriptionResult,
  ProviderWebhookEvent,
  PaymentEventType,
} from '../interfaces/payment-provider.interface';

/**
 * Base class for payment provider placeholders.
 * All live methods throw NotImplementedException until the provider is fully implemented.
 */
export abstract class BasePaymentProvider implements IPaymentProvider {
  abstract readonly providerId: string;
  abstract readonly displayName: string;
  abstract readonly supportedCountries: string[];
  abstract readonly supportedCurrencies: string[];
  readonly isLive = false;

  async createCustomer(_params: CreateCustomerParams): Promise<ProviderCustomerResult> {
    throw new NotImplementedException(`${this.displayName}: createCustomer is not yet implemented`);
  }

  async createSubscription(_params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult> {
    throw new NotImplementedException(`${this.displayName}: createSubscription is not yet implemented`);
  }

  async cancelSubscription(_providerSubscriptionId: string): Promise<void> {
    throw new NotImplementedException(`${this.displayName}: cancelSubscription is not yet implemented`);
  }

  async createPaymentIntent(_params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult> {
    throw new NotImplementedException(`${this.displayName}: createPaymentIntent is not yet implemented`);
  }

  validateWebhookSignature(_rawBody: Buffer, _signature: string): boolean {
    throw new NotImplementedException(`${this.displayName}: validateWebhookSignature is not yet implemented`);
  }

  parseWebhookEvent(_rawBody: Buffer): ProviderWebhookEvent {
    return { eventType: PaymentEventType.UNKNOWN, providerEventId: 'placeholder' };
  }
}
