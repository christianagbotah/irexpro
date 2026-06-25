import { Injectable } from '@nestjs/common';
import { BasePaymentProvider } from './base-provider';

/**
 * StripePaymentProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Supports: UK, US, CA, AU, SG, AE, EU and more.
 * Currencies: GBP, USD, EUR, AUD, CAD, SGD, AED, and others.
 *
 * Live implementation: Sprint 5-6
 * See: docs/architecture/21-payment-provider-architecture.md
 */
@Injectable()
export class StripePaymentProvider extends BasePaymentProvider {
  readonly providerId = 'stripe';
  readonly displayName = 'Stripe';
  readonly supportedCountries = ['GB', 'US', 'CA', 'AU', 'SG', 'AE', 'DE', 'FR', 'NL', 'IE'];
  readonly supportedCurrencies = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'SGD', 'AED'];
  readonly isLive = false;
}
