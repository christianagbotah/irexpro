import { Injectable } from '@nestjs/common';
import { BasePaymentProvider } from './base-provider';

/**
 * HubtelPaymentProvider — PLACEHOLDER (Sprint 5-6 implementation)
 *
 * Ghana-primary provider. Mobile money (MTN, Vodafone, AirtelTigo) + card.
 * See: https://developers.hubtel.com
 *
 * Live implementation: Sprint 5-6
 * See: docs/architecture/21-payment-provider-architecture.md
 */
@Injectable()
export class HubtelPaymentProvider extends BasePaymentProvider {
  readonly providerId = 'hubtel';
  readonly displayName = 'Hubtel';
  readonly supportedCountries = ['GH'];
  readonly supportedCurrencies = ['GHS', 'USD'];
  readonly isLive = false;
  readonly supportedPaymentMethods = ['mobile_money', 'card'];
}
