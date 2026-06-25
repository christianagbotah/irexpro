import { Injectable } from '@nestjs/common';
import { BasePaymentProvider } from './base-provider';

/**
 * PaystackPaymentProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Supports: GH, NG, KE, ZA — Africa-first coverage.
 * Currencies: GHS, NGN, KES, ZAR.
 *
 * Live implementation: Sprint 5-6
 * See: docs/architecture/21-payment-provider-architecture.md
 */
@Injectable()
export class PaystackPaymentProvider extends BasePaymentProvider {
  readonly providerId = 'paystack';
  readonly displayName = 'Paystack';
  readonly supportedCountries = ['GH', 'NG', 'KE', 'ZA'];
  readonly supportedCurrencies = ['GHS', 'NGN', 'KES', 'ZAR', 'USD'];
  readonly isLive = false;
}
