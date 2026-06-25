import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ISmsProvider } from '../interfaces/sms-provider.interface';

/**
 * SmsProviderRegistry — Holds all registered ISmsProvider implementations.
 * Provider selection is based on country, delivery reliability, cost, and availability.
 * No provider is hardcoded in business logic.
 */
@Injectable()
export class SmsProviderRegistry {
  private readonly logger = new Logger(SmsProviderRegistry.name);
  private readonly providers = new Map<string, ISmsProvider>();

  register(provider: ISmsProvider): void {
    this.providers.set(provider.providerId, provider);
    this.logger.log(`Registered SMS provider: ${provider.providerId} (live=${provider.isLive})`);
  }

  getProvider(providerId: string): ISmsProvider {
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new NotFoundException(`SMS provider not registered: ${providerId}`);
    }
    return provider;
  }

  selectProvider(countryCode: string, preferredProviderId?: string): ISmsProvider {
    if (preferredProviderId) {
      const preferred = this.providers.get(preferredProviderId);
      if (preferred && preferred.supportedCountries.includes(countryCode)) return preferred;
    }

    const candidates = Array.from(this.providers.values()).filter(
      (p) => p.supportedCountries.includes(countryCode) || p.supportedCountries.includes('*'),
    );

    if (candidates.length === 0) {
      const twilio = this.providers.get('twilio');
      if (twilio) {
        this.logger.warn(`No SMS provider for ${countryCode}, falling back to Twilio`);
        return twilio;
      }
      throw new NotFoundException(`No SMS provider available for country=${countryCode}`);
    }

    return candidates[0];
  }
}
