import { Injectable } from '@nestjs/common';
import { BasePaymentProvider } from './base-provider';

/**
 * WisePayoutProvider — PLACEHOLDER (Phase 3 / Sprint 7+ implementation)
 *
 * International payout provider (not subscription billing).
 * Used for cross-border performance fee payouts in Model B.
 *
 * Live implementation: Phase 3
 * See: docs/architecture/21-payment-provider-architecture.md
 */
@Injectable()
export class WisePayoutProvider extends BasePaymentProvider {
  readonly providerId = 'wise';
  readonly displayName = 'Wise (Payouts)';
  readonly supportedCountries = ['GB', 'US', 'CA', 'AU', 'SG', 'DE', 'FR', 'NL'];
  readonly supportedCurrencies = ['GBP', 'USD', 'EUR', 'AUD', 'CAD', 'SGD'];
  readonly isLive = false;
  readonly supportedPaymentMethods = ['bank_transfer'];
}
