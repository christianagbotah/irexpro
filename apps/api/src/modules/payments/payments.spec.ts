import { NotImplementedException } from '@nestjs/common';
import { IPaymentProvider } from './interfaces/payment-provider.interface';
import { StripePaymentProvider } from './providers/stripe.provider';
import { PaystackPaymentProvider } from './providers/paystack.provider';
import { FlutterwavePaymentProvider } from './providers/flutterwave.provider';
import { HubtelPaymentProvider } from './providers/hubtel.provider';
import { PayPalBraintreePaymentProvider } from './providers/paypal.provider';
import { WisePayoutProvider } from './providers/wise.provider';
import { ManualPaymentProvider } from './providers/manual.provider';

const providerCases: [string, IPaymentProvider][] = [
  ['Stripe', new StripePaymentProvider()],
  ['Paystack', new PaystackPaymentProvider()],
  ['Flutterwave', new FlutterwavePaymentProvider()],
  ['Hubtel', new HubtelPaymentProvider()],
  ['PayPal/Braintree', new PayPalBraintreePaymentProvider()],
  ['Wise', new WisePayoutProvider()],
];

describe('Payment Provider Placeholders', () => {
  it.each(providerCases)('%s.createSubscription should throw NotImplementedException', async (_name, provider) => {
    await expect(
      provider.createSubscription({
        providerCustomerId: 'cust_123',
        providerPlanId: 'plan_123',
        currency: 'USD',
      }),
    ).rejects.toThrow(NotImplementedException);
  });

  it.each(providerCases)('%s.createCustomer should throw NotImplementedException', async (_name, provider) => {
    await expect(
      provider.createCustomer({ userId: 'user-id', email: 'test@example.com' }),
    ).rejects.toThrow(NotImplementedException);
  });

  it.each(providerCases)('%s.createPaymentIntent should throw NotImplementedException', async (_name, provider) => {
    await expect(
      provider.createPaymentIntent({
        providerCustomerId: 'cust_123',
        amountCents: 2900,
        currency: 'USD',
      }),
    ).rejects.toThrow(NotImplementedException);
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

  it('validateWebhookSignature should always return true in dev', () => {
    expect(manual.validateWebhookSignature(Buffer.from('test'), 'sig')).toBe(true);
  });
});
