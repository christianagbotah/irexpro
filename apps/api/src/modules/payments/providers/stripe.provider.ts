import { Injectable } from '@nestjs/common';
import { BasePaymentProvider } from './base-provider';

/**
 * StripePaymentProvider — PLACEHOLDER (live implementation in future sprint)
 *
 * Supports: UK, US, CA, AU, SG, AE, EU and more.
 * Currencies: GBP, USD, EUR, AUD, CAD, SGD, AED, and others.
 *
 * Fail-closed: throws NotImplementedException until STRIPE_SECRET_KEY is configured
 * and live HTTP integration is built.
 *
 * See: docs/architecture/21-payment-provider-architecture.md
 */
@Injectable()
export class StripePaymentProvider extends BasePaymentProvider {
  readonly providerId = 'stripe';
  readonly displayName = 'Stripe';
  readonly supportedCountries = ['GB', 'US', 'CA', 'AU', 'SG', 'AE', 'DE', 'FR', 'NL', 'IE', 'NG', 'KE', 'GH', 'ZA'];
  readonly supportedCurrencies = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'SGD', 'AED', 'NGN', 'KES', 'GHS', 'ZAR'];
  readonly isLive = false;
  readonly supportedPaymentMethods = ['card'];
}
