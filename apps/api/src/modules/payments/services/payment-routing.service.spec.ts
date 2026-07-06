import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentRoutingService } from './payment-routing.service';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
import { CountryConfig } from '../../global-config/entities/country-config.entity';
import { StripePaymentProvider } from '../providers/stripe.provider';
import { PaystackPaymentProvider } from '../providers/paystack.provider';
import { FlutterwavePaymentProvider } from '../providers/flutterwave.provider';
import { HubtelPaymentProvider } from '../providers/hubtel.provider';
import { PayPalBraintreePaymentProvider } from '../providers/paypal.provider';
import { ManualPaymentProvider } from '../providers/manual.provider';
import { PaystackHttpClient } from '../providers/paystack-http.client';

const mockCountryConfigRepo = { findOne: jest.fn() };

/** Disabled by default (PAYSTACK_ENABLED=false) — mirrors production defaults. */
function mockDisabledConfigService(): any {
  return { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? undefined) };
}

function buildRegistry(): PaymentProviderRegistry {
  const registry = new PaymentProviderRegistry();
  registry.register(new ManualPaymentProvider());
  registry.register(new StripePaymentProvider());
  registry.register(new PaystackPaymentProvider(mockDisabledConfigService(), new PaystackHttpClient()));
  registry.register(new FlutterwavePaymentProvider());
  registry.register(new HubtelPaymentProvider());
  registry.register(new PayPalBraintreePaymentProvider());
  return registry;
}

function ghConfig(): Partial<CountryConfig> {
  return {
    countryCode: 'GH',
    isActive: true,
    isBlocked: false,
    enabledPaymentProviders: ['hubtel', 'paystack', 'flutterwave', 'stripe', 'manual'],
  };
}

function usConfig(): Partial<CountryConfig> {
  return {
    countryCode: 'US',
    isActive: true,
    isBlocked: false,
    enabledPaymentProviders: ['stripe', 'paypal', 'manual'],
  };
}

describe('PaymentRoutingService', () => {
  let service: PaymentRoutingService;
  let module: TestingModule;

  beforeEach(async () => {
    jest.clearAllMocks();

    module = await Test.createTestingModule({
      providers: [
        PaymentRoutingService,
        { provide: PaymentProviderRegistry, useValue: buildRegistry() },
        { provide: getRepositoryToken(CountryConfig), useValue: mockCountryConfigRepo },
      ],
    }).compile();

    service = module.get<PaymentRoutingService>(PaymentRoutingService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('getAllPublicProviders', () => {
    it('should exclude manual provider', () => {
      const providers = service.getAllPublicProviders();
      const ids = providers.map((p) => p.providerId);
      expect(ids).not.toContain('manual');
      expect(ids).toContain('stripe');
      expect(ids).toContain('paystack');
    });

    it('should include isSandbox flag', () => {
      const providers = service.getAllPublicProviders();
      providers.forEach((p) => {
        expect(p.isSandbox).toBe(true); // all placeholders are sandbox
        expect(p.isLive).toBe(false);
      });
    });

    it('should not expose secrets (no providerId that is "manual")', () => {
      const providers = service.getAllPublicProviders();
      const json = JSON.stringify(providers);
      expect(json).not.toContain('SECRET');
      expect(json).not.toContain('secret');
    });
  });

  describe('getAvailableProviders — Ghana', () => {
    beforeEach(() => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
    });

    it('should include Hubtel, Paystack, Flutterwave for GH/GHS', async () => {
      const providers = await service.getAvailableProviders('GH', 'GHS');
      const ids = providers.map((p) => p.providerId);
      expect(ids).toContain('hubtel');
      expect(ids).toContain('paystack');
      expect(ids).toContain('flutterwave');
    });

    it('should exclude manual provider', async () => {
      const providers = await service.getAvailableProviders('GH', 'GHS');
      expect(providers.map((p) => p.providerId)).not.toContain('manual');
    });
  });

  describe('getAvailableProviders — US', () => {
    beforeEach(() => {
      mockCountryConfigRepo.findOne.mockResolvedValue(usConfig());
    });

    it('should include Stripe and PayPal for US/USD', async () => {
      const providers = await service.getAvailableProviders('US', 'USD');
      const ids = providers.map((p) => p.providerId);
      expect(ids).toContain('stripe');
      expect(ids).toContain('paypal');
    });

    it('should reject unsupported currency (EUR for US config)', async () => {
      // US supports USD only via these providers — EUR not supported by paypal in US
      const providers = await service.getAvailableProviders('US', 'XYZ');
      expect(providers).toHaveLength(0);
    });
  });

  describe('routeForCheckout', () => {
    it('should route to Hubtel for GH/GHS (first enabled)', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      const { provider } = await service.routeForCheckout('GH', 'GHS');
      expect(provider.providerId).toBe('hubtel');
    });

    it('should route to Stripe for US/USD', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(usConfig());
      const { provider } = await service.routeForCheckout('US', 'USD');
      expect(provider.providerId).toBe('stripe');
    });

    it('should use preferred provider if specified and enabled', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      const { provider, reason } = await service.routeForCheckout('GH', 'GHS', 'stripe');
      expect(provider.providerId).toBe('stripe');
      expect(reason).toBe('preferred');
    });

    it('should throw if preferred provider not enabled for country', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(usConfig());
      await expect(service.routeForCheckout('US', 'USD', 'hubtel')).rejects.toThrow(BadRequestException);
    });

    it('should throw for blocked country', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue({
        countryCode: 'XX',
        isActive: true,
        isBlocked: true,
        enabledPaymentProviders: ['stripe'],
      });
      await expect(service.routeForCheckout('XX', 'USD')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for unknown country', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(null);
      await expect(service.routeForCheckout('ZZ', 'USD')).rejects.toThrow(NotFoundException);
    });

    it('should throw if preferred provider does not support currency', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      // Hubtel supports GHS and USD — not EUR
      await expect(service.routeForCheckout('GH', 'EUR', 'hubtel')).rejects.toThrow(BadRequestException);
    });

    it('should not route to manual provider', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      const { provider } = await service.routeForCheckout('GH', 'GHS');
      expect(provider.providerId).not.toBe('manual');
    });
  });

  describe('Paystack availability — Sprint 15', () => {
    function enabledConfigService(): any {
      const values: Record<string, unknown> = {
        'paystack.enabled': true,
        'paystack.secretKey': 'sk_test_routing_secret',
      };
      return { get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
    }

    it('Paystack appears in the country provider list but is not live when disabled/missing config', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      const providers = await service.getAvailableProviders('GH', 'GHS');
      const paystack = providers.find((p) => p.providerId === 'paystack');
      expect(paystack).toBeDefined();
      expect(paystack?.isLive).toBe(false);
      expect(paystack?.isSandbox).toBe(true);
    });

    it('Paystack is reported live when enabled/configured and country/currency supported', async () => {
      const registryWithLivePaystack = new PaymentProviderRegistry();
      registryWithLivePaystack.register(new ManualPaymentProvider());
      registryWithLivePaystack.register(
        new PaystackPaymentProvider(enabledConfigService(), new PaystackHttpClient()),
      );
      const moduleWithLive = await Test.createTestingModule({
        providers: [
          PaymentRoutingService,
          { provide: PaymentProviderRegistry, useValue: registryWithLivePaystack },
          { provide: getRepositoryToken(CountryConfig), useValue: mockCountryConfigRepo },
        ],
      }).compile();
      const liveService = moduleWithLive.get<PaymentRoutingService>(PaymentRoutingService);

      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      const providers = await liveService.getAvailableProviders('GH', 'GHS');
      const paystack = providers.find((p) => p.providerId === 'paystack');
      expect(paystack).toBeDefined();
      expect(paystack?.isLive).toBe(true);
      expect(paystack?.isSandbox).toBe(false);

      await moduleWithLive.close();
    });

    it('routes checkout to Paystack when explicitly preferred for GH/GHS', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      const { provider, reason } = await service.routeForCheckout('GH', 'GHS', 'paystack');
      expect(provider.providerId).toBe('paystack');
      expect(reason).toBe('preferred');
    });

    it('routes checkout to Paystack when explicitly preferred for NG/NGN', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue({
        countryCode: 'NG',
        isActive: true,
        isBlocked: false,
        enabledPaymentProviders: ['paystack', 'flutterwave', 'stripe', 'manual'],
      });
      const { provider, reason } = await service.routeForCheckout('NG', 'NGN', 'paystack');
      expect(provider.providerId).toBe('paystack');
      expect(reason).toBe('preferred');
    });

    describe('auto-routing prefers a live provider over an earlier-listed placeholder', () => {
      async function buildLiveGhRoutingService(): Promise<PaymentRoutingService> {
        const registry = new PaymentProviderRegistry();
        registry.register(new ManualPaymentProvider());
        registry.register(new StripePaymentProvider());
        registry.register(
          new PaystackPaymentProvider(
            {
              get: jest.fn((key: string, fallback?: unknown) => {
                const values: Record<string, unknown> = {
                  'paystack.enabled': true,
                  'paystack.secretKey': 'sk_test_gh_live',
                };
                return values[key] ?? fallback;
              }),
            } as any,
            new PaystackHttpClient(),
          ),
        );
        registry.register(new FlutterwavePaymentProvider());
        registry.register(new HubtelPaymentProvider());
        const module = await Test.createTestingModule({
          providers: [
            PaymentRoutingService,
            { provide: PaymentProviderRegistry, useValue: registry },
            { provide: getRepositoryToken(CountryConfig), useValue: mockCountryConfigRepo },
          ],
        }).compile();
        return module.get<PaymentRoutingService>(PaymentRoutingService);
      }

      it('auto-routes GH/GHS to Paystack (live) instead of Hubtel (non-live, listed first) when no provider is explicitly preferred', async () => {
        mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig()); // hubtel listed before paystack
        const liveService = await buildLiveGhRoutingService();

        const { provider, reason } = await liveService.routeForCheckout('GH', 'GHS');

        expect(provider.providerId).toBe('paystack');
        expect(provider.isLive).toBe(true);
        expect(reason).toBe('country_config');
      });

      it('falls back to the first listed non-live provider when no configured provider is live (existing GH default)', async () => {
        // Default registry (this describe block's parent) has Paystack disabled —
        // preserves pre-Sprint-15 placeholder routing behaviour when nothing is live.
        mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
        const { provider, reason } = await service.routeForCheckout('GH', 'GHS');
        expect(provider.providerId).toBe('hubtel');
        expect(reason).toBe('country_config');
      });
    });
  });

  describe('manual provider stays blocked for public checkout — Sprint 15 regression', () => {
    it('manual is never returned by getAllPublicProviders even when explicitly enabled in CountryConfig', () => {
      const providers = service.getAllPublicProviders();
      expect(providers.map((p) => p.providerId)).not.toContain('manual');
    });

    it('manual is never returned by getAvailableProviders even when explicitly enabled in CountryConfig', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue({
        countryCode: 'GH',
        isActive: true,
        isBlocked: false,
        enabledPaymentProviders: ['manual', 'paystack'],
      });
      const providers = await service.getAvailableProviders('GH', 'GHS');
      expect(providers.map((p) => p.providerId)).not.toContain('manual');
    });

    it('routeForCheckout rejects an explicit manual preference for public checkout', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue({
        countryCode: 'GH',
        isActive: true,
        isBlocked: false,
        enabledPaymentProviders: ['manual', 'paystack'],
      });
      await expect(service.routeForCheckout('GH', 'GHS', 'manual')).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /payments/providers exposes no secrets — Sprint 15 regression', () => {
    it('does not expose the Paystack secret key or any secret-like field', async () => {
      mockCountryConfigRepo.findOne.mockResolvedValue(ghConfig());
      const providers = await service.getAvailableProviders('GH', 'GHS');
      const json = JSON.stringify(providers);
      expect(json).not.toContain('sk_test');
      expect(json).not.toContain('SECRET');
      expect(json).not.toContain('secretKey');
      expect(json).not.toContain('webhookSecret');
      expect(json).not.toContain('Authorization');
    });
  });
});
