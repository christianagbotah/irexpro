import { Injectable } from '@nestjs/common';
import { BasePaymentProvider } from './base-provider';

/**
 * PayPalBraintreePaymentProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Global provider via PayPal / Braintree gateway.
 *
 * Live implementation: Sprint 5-6
 * See: docs/architecture/21-payment-provider-architecture.md
 */
@Injectable()
export class PayPalBraintreePaymentProvider extends BasePaymentProvider {
  readonly providerId = 'paypal';
  readonly displayName = 'PayPal / Braintree';
  readonly supportedCountries = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'NL'];
  readonly supportedCurrencies = ['USD', 'GBP', 'EUR', 'AUD', 'CAD'];
  readonly isLive = false;
}
