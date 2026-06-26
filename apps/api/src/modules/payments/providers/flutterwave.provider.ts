import { Injectable } from '@nestjs/common';
import { BasePaymentProvider } from './base-provider';

/**
 * FlutterwavePaymentProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Pan-Africa coverage: 30+ African countries.
 * Currencies: NGN, GHS, KES, ZAR, UGX, TZS, XOF, XAF, USD.
 *
 * Live implementation: Sprint 5-6
 * See: docs/architecture/21-payment-provider-architecture.md
 */
@Injectable()
export class FlutterwavePaymentProvider extends BasePaymentProvider {
  readonly providerId = 'flutterwave';
  readonly displayName = 'Flutterwave';
  readonly supportedCountries = ['GH', 'NG', 'KE', 'ZA', 'UG', 'TZ', 'CM', 'CI', 'SN'];
  readonly supportedCurrencies = ['NGN', 'GHS', 'KES', 'ZAR', 'UGX', 'TZS', 'USD'];
  readonly isLive = false;
  readonly supportedPaymentMethods = ['card', 'mobile_money', 'bank_transfer', 'ussd'];
}
