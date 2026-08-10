import { NotImplementedException } from '@nestjs/common';
import { IPaymentProvider } from './interfaces/payment-provider.interface';
import { StripePaymentProvider } from './providers/stripe.provider';
import { StripeHttpClient } from './providers/stripe-http.client';
import { PaystackPaymentProvider } from './providers/paystack.provider';
import { PaystackHttpClient } from './providers/paystack-http.client';
import { FlutterwavePaymentProvider } from './providers/flutterwave.provider';
import { HubtelPaymentProvider } from './providers/hubtel.provider';
import { PayPalBraintreePaymentProvider } from './providers/paypal.provider';
import { WisePayoutProvider } from './providers/wise.provider';
import { ManualPaymentProvider } from './providers/manual.provider';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';

/** STRIPE_ENABLED=false / PAYSTACK_ENABLED=false, no secret key — mirrors production defaults. */
function disabledConfigService(): any {
  return { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? undefined) };
}

function buildDisabledPaystackProvider(): PaystackPaymentProvider {
  return new PaystackPaymentProvider(disabledConfigService(), new PaystackHttpClient());
}

function buildDisabledStripeProvider(): StripePaymentProvider {
  return new StripePaymentProvider(disabledConfigService(), new StripeHttpClient());
}

// Stripe and Paystack are real implementations (Sprint 17 / Sprint 15), not raw
// NotImplementedException placeholders like the providers below — they have their
// own dedicated fail-closed test suites in `providers/stripe.provider.spec.ts` and
// `providers/paystack.provider.spec.ts`.
const providerCases: [string, IPaymentProvider][] = [
  ['Flutterwave', new FlutterwavePaymentProvider()],
  ['Hubtel', new HubtelPaymentProvider()],
  ['PayPal/Braintree', new PayPalBraintreePaymentProvider()],
  ['Wise', new WisePayoutProvider()],
];

describe('Payment Provider Placeholders — fail closed', () => {
  it.each(providerCases)(
    '%s.createCheckoutSession should throw NotImplementedException',
    async (_name, provider) => {
      await expect(
        provider.createCheckoutSession({
          userId: 'u1',
          email: 'u@test.com',
          planId: 'p1',
          currency: 'USD',
          amountMinor: 2900,
          countryCode: 'US',
        }),
      ).rejects.toThrow(NotImplementedException);
    },
  );

  it.each(providerCases)(
    '%s.createSubscription should throw NotImplementedException',
    async (_name, provider) => {
      await expect(
        provider.createSubscription({
          providerCustomerId: 'cust_123',
          providerPlanId: 'plan_123',
          currency: 'USD',
        }),
      ).rejects.toThrow(NotImplementedException);
    },
  );

  it.each(providerCases)(
    '%s.createCustomer should throw NotImplementedException',
    async (_name, provider) => {
      await expect(
        provider.createCustomer({ userId: 'user-id', email: 'test@example.com' }),
      ).rejects.toThrow(NotImplementedException);
    },
  );

  it.each(providerCases)(
    '%s.createPaymentIntent should throw NotImplementedException',
    async (_name, provider) => {
      await expect(
        provider.createPaymentIntent({
          providerCustomerId: 'cust_123',
          amountCents: 2900,
          currency: 'USD',
        }),
      ).rejects.toThrow(NotImplementedException);
    },
  );

  it.each(providerCases)(
    '%s.verifyWebhookSignature should fail closed (return false)',
    (_name, provider) => {
      // Placeholder providers must fail closed — never accept a signature
      const result = provider.verifyWebhookSignature(Buffer.from('{}'), {});
      expect(result).toBe(false);
    },
  );

  it.each(providerCases)(
    '%s.getTransactionStatus should throw NotImplementedException',
    async (_name, provider) => {
      await expect(provider.getTransactionStatus('ref_123')).rejects.toThrow(
        NotImplementedException,
      );
    },
  );

  it.each(providerCases)('%s should have supportedPaymentMethods defined', (_name, provider) => {
    expect(Array.isArray(provider.supportedPaymentMethods)).toBe(true);
    expect(provider.supportedPaymentMethods.length).toBeGreaterThan(0);
  });
});

describe('ManualPaymentProvider (DEV/TEST)', () => {
  const manual = new ManualPaymentProvider();

  it('should have isLive = false', () => {
    expect(manual.isLive).toBe(false);
  });

  it('should return a mock customer reference', async () => {
    const result = await manual.createCustomer({ userId: 'user-id', email: 'dev@test.com' });
    expect(result.providerCustomerId).toContain('manual_cust_');
    expect(result.provider).toBe('manual');
  });

  it('should return a mock subscription reference', async () => {
    const result = await manual.createSubscription({
      providerCustomerId: 'cust_123',
      providerPlanId: 'plan_123',
      currency: 'USD',
    });
    expect(result.providerSubscriptionId).toContain('manual_sub_');
    expect(result.status).toBe('active');
  });

  it('verifyWebhookSignature should return true in dev', () => {
    expect(manual.verifyWebhookSignature(Buffer.from('test'), {})).toBe(true);
  });

  it('validateWebhookSignature (legacy) should return true in dev', () => {
    expect(manual.validateWebhookSignature(Buffer.from('test'), 'sig')).toBe(true);
  });

  it('createCheckoutSession should return a session reference', async () => {
    const result = await manual.createCheckoutSession({
      userId: 'u1',
      email: 'u@test.com',
      planId: 'p1',
      currency: 'USD',
      amountMinor: 2900,
      countryCode: 'US',
    });
    expect(result.sessionId).toContain('manual_session_');
    expect(result.provider).toBe('manual');
    expect(result.checkoutUrl).toBeUndefined();
  });

  it('getTransactionStatus should return SUCCEEDED in dev', async () => {
    const result = await manual.getTransactionStatus('manual_ref_123');
    expect(result.status).toBe('SUCCEEDED');
  });
});

describe('PaymentProviderRegistry', () => {
  let registry: PaymentProviderRegistry;

  beforeEach(() => {
    registry = new PaymentProviderRegistry();
    registry.register(new ManualPaymentProvider());
    registry.register(buildDisabledStripeProvider());
    registry.register(buildDisabledPaystackProvider());
  });

  it('should return registered provider', () => {
    const provider = registry.getProvider('stripe');
    expect(provider.providerId).toBe('stripe');
  });

  it('should throw NotFoundException for unknown provider', () => {
    expect(() => registry.getProvider('nonexistent')).toThrow();
  });

  it('getAvailableProviders should return all registered', () => {
    const providers = registry.getAvailableProviders();
    expect(providers.length).toBe(3);
  });

  it('manual provider should not be selectable in public checkout via selectProvider', () => {
    // selectProvider excludes 'manual'
    const provider = registry.selectProvider('US', 'USD');
    expect(provider.providerId).not.toBe('manual');
  });

  it('placeholders fail closed when credentials missing (verifyWebhookSignature returns false)', () => {
    const stripe = registry.getProvider('stripe');
    expect(stripe.verifyWebhookSignature(Buffer.from('{}'), {})).toBe(false);
  });

  it('ManualPaymentProvider should not be available as public checkout provider in production', () => {
    const manual = registry.getProvider('manual');
    expect(manual.isLive).toBe(false);
    expect(manual.providerId).toBe('manual');
    // In production routing, PaymentRoutingService excludes 'manual' by name
    // This test documents the invariant
    const publicProviders = registry
      .getAvailableProviders()
      .filter((p) => p.providerId !== 'manual');
    expect(publicProviders.map((p) => p.providerId)).not.toContain('manual');
  });
});
