import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { IPaymentProvider } from '../interfaces/payment-provider.interface';

/**
 * PaymentProviderRegistry — Holds all registered IPaymentProvider implementations.
 *
 * Providers register themselves on module init.
 * Services call getProvider(providerId) to get a specific provider.
 * Services call selectProvider(countryCode, currency) to get the best provider
 * for a given country/currency combination (routing via CountryConfig).
 */
@Injectable()
export class PaymentProviderRegistry {
  private readonly logger = new Logger(PaymentProviderRegistry.name);
  private readonly providers = new Map<string, IPaymentProvider>();

  register(provider: IPaymentProvider): void {
    this.providers.set(provider.providerId, provider);
    this.logger.log(`Registered payment provider: ${provider.providerId} (live=${provider.isLive})`);
  }

  getProvider(providerId: string): IPaymentProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new NotFoundException(`Payment provider not registered: ${providerId}`);
    }
    return provider;
  }

  getAvailableProviders(): IPaymentProvider[] {
    return Array.from(this.providers.values());
  }

  selectProvider(countryCode: string, currency: string, preferredProviderId?: string): IPaymentProvider {
    if (preferredProviderId) {
      const preferred = this.providers.get(preferredProviderId);
      if (preferred && preferred.supportedCountries.includes(countryCode)) {
        return preferred;
      }
    }

    const candidates = Array.from(this.providers.values()).filter(
      (p) =>
        p.supportedCountries.includes(countryCode) &&
        p.supportedCurrencies.includes(currency) &&
        p.providerId !== 'manual',
    );

    if (candidates.length === 0) {
      const fallback = this.providers.get('stripe');
      if (fallback) {
        this.logger.warn(`No provider found for ${countryCode}/${currency}, falling back to Stripe`);
        return fallback;
      }
      throw new NotFoundException(`No payment provider available for country=${countryCode} currency=${currency}`);
    }

    return candidates[0];
  }
}
