import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CountryConfig } from '../../global-config/entities/country-config.entity';
import { IPaymentProvider } from '../interfaces/payment-provider.interface';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';

export interface AvailableProviderDto {
  providerId: string;
  displayName: string;
  supportedCurrencies: string[];
  supportedCountries: string[];
  supportedPaymentMethods: string[];
  isLive: boolean;
  isSandbox: boolean;
}

export interface RouteProviderResult {
  provider: IPaymentProvider;
  reason: string;
}

/**
 * PaymentRoutingService
 *
 * Determines available and preferred payment providers for a given user country/currency.
 * Uses CountryConfig from the database to drive routing decisions.
 *
 * RULES:
 * - Never silently choose an unavailable provider.
 * - Fail fast on unsupported country/currency combinations.
 * - ManualPaymentProvider must never be routed to for public checkout.
 * - All routing decisions are logged.
 */
@Injectable()
export class PaymentRoutingService {
  private readonly logger = new Logger(PaymentRoutingService.name);

  constructor(
    private readonly registry: PaymentProviderRegistry,
    @InjectRepository(CountryConfig)
    private readonly countryConfigRepo: Repository<CountryConfig>,
  ) {}

  /**
   * Returns the list of public-facing available providers for a country/currency.
   * Excludes the manual provider and any provider not registered in the registry.
   */
  async getAvailableProviders(
    countryCode: string,
    currency: string,
  ): Promise<AvailableProviderDto[]> {
    const config = await this.countryConfigRepo.findOne({
      where: { countryCode: countryCode.toUpperCase(), isActive: true, isBlocked: false },
    });

    const enabledIds: string[] = config?.enabledPaymentProviders ?? [];
    const allProviders = this.registry.getAvailableProviders();

    return allProviders
      .filter((p) => {
        if (p.providerId === 'manual') return false;
        if (!enabledIds.includes(p.providerId)) return false;
        const supportsCurrency =
          p.supportedCurrencies.includes(currency) || p.supportedCurrencies.includes('*');
        const supportsCountry =
          p.supportedCountries.includes(countryCode.toUpperCase()) ||
          p.supportedCountries.includes('*');
        return supportsCurrency && supportsCountry;
      })
      .map((p) => ({
        providerId: p.providerId,
        displayName: p.displayName,
        supportedCurrencies: p.supportedCurrencies,
        supportedCountries: p.supportedCountries,
        supportedPaymentMethods: p.supportedPaymentMethods,
        isLive: p.isLive,
        isSandbox: !p.isLive,
      }));
  }

  /**
   * Lists all public-facing providers regardless of country/currency filter.
   * Used for the GET /payments/providers endpoint.
   */
  getAllPublicProviders(): AvailableProviderDto[] {
    return this.registry
      .getAvailableProviders()
      .filter((p) => p.providerId !== 'manual')
      .map((p) => ({
        providerId: p.providerId,
        displayName: p.displayName,
        supportedCurrencies: p.supportedCurrencies,
        supportedCountries: p.supportedCountries,
        supportedPaymentMethods: p.supportedPaymentMethods,
        isLive: p.isLive,
        isSandbox: !p.isLive,
      }));
  }

  /**
   * Routes to the best available provider for a checkout request.
   *
   * Priority:
   * 1. Preferred provider if specified, available, and enabled for country.
   * 2. First provider enabled in CountryConfig that supports country+currency.
   * 3. Stripe global fallback if it supports the currency.
   * 4. Throws BadRequestException if no provider is found.
   */
  async routeForCheckout(
    countryCode: string,
    currency: string,
    preferredProviderId?: string,
  ): Promise<RouteProviderResult> {
    const country = countryCode.toUpperCase();
    const config = await this.countryConfigRepo.findOne({
      where: { countryCode: country },
    });

    if (!config) {
      throw new NotFoundException(`No CountryConfig found for country: ${country}`);
    }

    if (config.isBlocked) {
      throw new BadRequestException(`Payments are not available in your country (${country})`);
    }

    const enabledIds: string[] = config.enabledPaymentProviders ?? [];
    // Remove 'manual' from public routing — it must never route to a live checkout
    const publicEnabledIds = enabledIds.filter((id) => id !== 'manual');

    // 1. Try preferred provider
    if (preferredProviderId) {
      if (!publicEnabledIds.includes(preferredProviderId)) {
        throw new BadRequestException(
          `Payment provider '${preferredProviderId}' is not available in ${country}`,
        );
      }
      const preferred = this.registry.getProvider(preferredProviderId);
      if (!this.providerSupportsCurrency(preferred, currency)) {
        throw new BadRequestException(
          `Provider '${preferredProviderId}' does not support currency ${currency}`,
        );
      }
      this.logger.log(
        `[Routing] Using preferred provider ${preferredProviderId} for ${country}/${currency}`,
      );
      return { provider: preferred, reason: 'preferred' };
    }

    // 2. Select first CountryConfig-enabled provider that supports country+currency
    for (const providerId of publicEnabledIds) {
      const candidate = this.tryGetProvider(providerId);
      if (!candidate) continue;
      if (
        this.providerSupportsCountry(candidate, country) &&
        this.providerSupportsCurrency(candidate, currency)
      ) {
        this.logger.log(
          `[Routing] Selected ${providerId} for ${country}/${currency} via CountryConfig`,
        );
        return { provider: candidate, reason: 'country_config' };
      }
    }

    // 3. Stripe global fallback
    const stripe = this.tryGetProvider('stripe');
    if (stripe && this.providerSupportsCurrency(stripe, currency)) {
      this.logger.warn(
        `[Routing] Falling back to Stripe for ${country}/${currency} — no preferred provider matched`,
      );
      return { provider: stripe, reason: 'stripe_fallback' };
    }

    throw new BadRequestException(
      `No payment provider is available for country=${country}, currency=${currency}`,
    );
  }

  private tryGetProvider(providerId: string): IPaymentProvider | null {
    try {
      return this.registry.getProvider(providerId);
    } catch {
      return null;
    }
  }

  private providerSupportsCurrency(p: IPaymentProvider, currency: string): boolean {
    return p.supportedCurrencies.includes(currency) || p.supportedCurrencies.includes('*');
  }

  private providerSupportsCountry(p: IPaymentProvider, country: string): boolean {
    return p.supportedCountries.includes(country) || p.supportedCountries.includes('*');
  }
}
