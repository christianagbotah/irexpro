import * as crypto from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { PaystackPaymentProvider } from './paystack.provider';
import { PaystackHttpClient } from './paystack-http.client';
import { PaymentEventType } from '../interfaces/payment-provider.interface';

const SECRET_KEY = 'sk_test_super_secret_paystack_key';
const WEBHOOK_SECRET = 'whsec_super_secret_webhook_key';

interface FakeConfig {
  enabled?: boolean;
  secretKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
  callbackUrl?: string;
}

function buildConfigService(cfg: FakeConfig): any {
  const values: Record<string, unknown> = {
    'paystack.enabled': cfg.enabled ?? false,
    'paystack.secretKey': cfg.secretKey,
    'paystack.webhookSecret': cfg.webhookSecret,
    'paystack.baseUrl': cfg.baseUrl ?? 'https://api.paystack.co',
    'paystack.callbackUrl': cfg.callbackUrl,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  };
}

function buildHttpClientMock() {
  return { request: jest.fn() } as unknown as PaystackHttpClient & { request: jest.Mock };
}

function signBody(rawBody: Buffer, secret: string): string {
  return crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
}

const CHECKOUT_REQUEST = {
  userId: 'user-1',
  email: 'user@example.com',
  planId: 'plan-1',
  currency: 'GHS',
  amountMinor: 50000,
  countryCode: 'GH',
  invoiceId: 'invoice-1',
  metadata: { transactionId: 'tx-1', type: 'SUBSCRIPTION_INITIAL' },
};

describe('PaystackPaymentProvider', () => {
  describe('fail-closed — disabled / unconfigured', () => {
    it('isLive is false when PAYSTACK_ENABLED=false', () => {
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: false, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      expect(provider.isLive).toBe(false);
    });

    it('isLive is false when enabled but secret key missing', () => {
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: true }),
        buildHttpClientMock(),
      );
      expect(provider.isLive).toBe(false);
    });

    it('isLive is true only when enabled AND secret key present', () => {
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      expect(provider.isLive).toBe(true);
    });

    it('createCheckoutSession throws when PAYSTACK_ENABLED=false', async () => {
      const http = buildHttpClientMock();
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: false, secretKey: SECRET_KEY }),
        http,
      );
      await expect(provider.createCheckoutSession(CHECKOUT_REQUEST)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(http.request).not.toHaveBeenCalled();
    });

    it('createCheckoutSession throws when secret key missing', async () => {
      const http = buildHttpClientMock();
      const provider = new PaystackPaymentProvider(buildConfigService({ enabled: true }), http);
      await expect(provider.createCheckoutSession(CHECKOUT_REQUEST)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(http.request).not.toHaveBeenCalled();
    });

    it('getTransactionStatus throws when disabled', async () => {
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: false }),
        buildHttpClientMock(),
      );
      await expect(provider.getTransactionStatus('ref_1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('verifyWebhookSignature returns false when disabled', () => {
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: false, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const signature = signBody(rawBody, SECRET_KEY);
      expect(
        provider.verifyWebhookSignature(rawBody, { 'x-paystack-signature': signature }),
      ).toBe(false);
    });

    it('fail-closed errors never contain the secret key', async () => {
      const provider = new PaystackPaymentProvider(buildConfigService({ enabled: false }), buildHttpClientMock());
      try {
        await provider.createCheckoutSession(CHECKOUT_REQUEST);
        fail('expected to throw');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain(SECRET_KEY);
        expect(message.toLowerCase()).not.toContain('sk_test');
      }
    });
  });

  describe('createCheckoutSession — enabled', () => {
    function buildEnabledProvider(http: PaystackHttpClient & { request: jest.Mock }) {
      return new PaystackPaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY, callbackUrl: 'https://app.irexpro.com/cb' }),
        http,
      );
    }

    it('sends a safe request shape with no secrets in body/metadata', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: { status: true, data: { authorization_url: 'https://checkout.paystack.com/abc', reference: 'psk_abc' } },
      });
      const provider = buildEnabledProvider(http);

      const result = await provider.createCheckoutSession(CHECKOUT_REQUEST);

      expect(http.request).toHaveBeenCalledTimes(1);
      const [url, options] = http.request.mock.calls[0];
      expect(url).toBe('https://api.paystack.co/transaction/initialize');
      expect(options.method).toBe('POST');
      expect(options.secretKey).toBe(SECRET_KEY);
      expect(options.body).toMatchObject({
        email: CHECKOUT_REQUEST.email,
        amount: CHECKOUT_REQUEST.amountMinor,
        currency: CHECKOUT_REQUEST.currency,
        callback_url: 'https://app.irexpro.com/cb',
      });
      expect(typeof options.body.reference).toBe('string');
      expect(options.body.reference).toMatch(/^psk_/);
      expect(options.body.metadata).toEqual({
        userId: 'user-1',
        internalTransactionId: 'tx-1',
        invoiceId: 'invoice-1',
        paymentPurpose: 'SUBSCRIPTION_INITIAL',
        planId: 'plan-1',
      });

      const serializedBody = JSON.stringify(options.body);
      expect(serializedBody).not.toContain(SECRET_KEY);

      expect(result.provider).toBe('paystack');
      expect(result.checkoutUrl).toBe('https://checkout.paystack.com/abc');
      expect(result.providerTransactionReference).toBe('psk_abc');
      expect(result.sessionId).toBe('psk_abc');
    });

    it('handles Paystack status=false safely', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: false,
        status: 200,
        body: { status: false, message: 'Invalid currency' },
        errorMessage: 'Invalid currency',
      });
      const provider = buildEnabledProvider(http);

      await expect(provider.createCheckoutSession(CHECKOUT_REQUEST)).rejects.toThrow('Invalid currency');
    });

    it('handles network failure safely without leaking internals', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: false,
        status: 0,
        body: null,
        errorMessage: 'Paystack request failed: network error',
      });
      const provider = buildEnabledProvider(http);

      await expect(provider.createCheckoutSession(CHECKOUT_REQUEST)).rejects.toThrow(
        'Paystack request failed: network error',
      );
    });

    it('omits subscriptionId/assessmentId from metadata when not provided', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: { status: true, data: { authorization_url: 'https://x', reference: 'psk_x' } },
      });
      const provider = buildEnabledProvider(http);
      await provider.createCheckoutSession(CHECKOUT_REQUEST);
      const [, options] = http.request.mock.calls[0];
      expect(options.body.metadata.subscriptionId).toBeUndefined();
      expect(options.body.metadata.assessmentId).toBeUndefined();
    });

    it('marks paymentPurpose as PERFORMANCE_FEE when metadata.type is set', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: { status: true, data: { authorization_url: 'https://x', reference: 'psk_y' } },
      });
      const provider = buildEnabledProvider(http);
      await provider.createCheckoutSession({
        ...CHECKOUT_REQUEST,
        metadata: { type: 'PERFORMANCE_FEE', assessmentId: 'assess-1' },
      });
      const [, options] = http.request.mock.calls[0];
      expect(options.body.metadata.paymentPurpose).toBe('PERFORMANCE_FEE');
      expect(options.body.metadata.assessmentId).toBe('assess-1');
    });
  });

  describe('verifyWebhookSignature', () => {
    function buildProvider(secretKey = SECRET_KEY, webhookSecret?: string) {
      return new PaystackPaymentProvider(
        buildConfigService({ enabled: true, secretKey, webhookSecret }),
        buildHttpClientMock(),
      );
    }

    it('succeeds with a valid signature', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { reference: 'r1' } }));
      const signature = signBody(rawBody, SECRET_KEY);
      expect(provider.verifyWebhookSignature(rawBody, { 'x-paystack-signature': signature })).toBe(true);
    });

    it('succeeds with a valid signature using a dedicated webhook secret', () => {
      const provider = buildProvider(SECRET_KEY, WEBHOOK_SECRET);
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const signature = signBody(rawBody, WEBHOOK_SECRET);
      expect(provider.verifyWebhookSignature(rawBody, { 'x-paystack-signature': signature })).toBe(true);
    });

    it('fails with an invalid signature', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      expect(
        provider.verifyWebhookSignature(rawBody, { 'x-paystack-signature': 'deadbeef' }),
      ).toBe(false);
    });

    it('fails with a well-formed but wrong signature', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const wrongSignature = signBody(rawBody, 'not-the-real-secret');
      expect(
        provider.verifyWebhookSignature(rawBody, { 'x-paystack-signature': wrongSignature }),
      ).toBe(false);
    });

    it('fails when signature header is missing', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      expect(provider.verifyWebhookSignature(rawBody, {})).toBe(false);
    });

    it('fails when rawBody is empty', () => {
      const provider = buildProvider();
      expect(
        provider.verifyWebhookSignature(Buffer.from(''), { 'x-paystack-signature': 'anything' }),
      ).toBe(false);
    });

    it('fails when secret is missing', () => {
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: true }),
        buildHttpClientMock(),
      );
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const signature = signBody(rawBody, SECRET_KEY);
      expect(provider.verifyWebhookSignature(rawBody, { 'x-paystack-signature': signature })).toBe(false);
    });

    it('never throws on malformed header arrays', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success' }));
      const signature = signBody(rawBody, SECRET_KEY);
      expect(() =>
        provider.verifyWebhookSignature(rawBody, { 'x-paystack-signature': [signature, 'extra'] }),
      ).not.toThrow();
    });
  });

  describe('parseWebhookEvent', () => {
    function buildProvider() {
      return new PaystackPaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
    }

    it('maps charge.success to PAYMENT_SUCCEEDED with safe fields', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          event: 'charge.success',
          data: {
            id: 123456,
            reference: 'psk_abc',
            amount: 50000,
            currency: 'GHS',
            status: 'success',
            customer: { customer_code: 'CUS_123', email: 'user@example.com' },
            metadata: { invoiceId: 'invoice-1', userId: 'user-1', cardNumber: '4111111111111111' },
          },
        }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_SUCCEEDED);
      expect(event.providerTransactionReference).toBe('psk_abc');
      expect(event.amountMinor).toBe(50000);
      expect(event.currency).toBe('GHS');
      expect(event.providerCustomerId).toBe('CUS_123');
      expect(event.providerEventId).toContain('charge.success');
      // Only whitelisted metadata keys survive — card data must never appear.
      expect(event.metadata).toEqual({ invoiceId: 'invoice-1', userId: 'user-1' });
      expect(JSON.stringify(event)).not.toContain('4111111111111111');
    });

    it('maps charge.failed to PAYMENT_FAILED', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'charge.failed', data: { id: 1, reference: 'psk_fail' } }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_FAILED);
    });

    it('maps invoice.payment_failed to PAYMENT_FAILED', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'invoice.payment_failed', data: { id: 2, reference: 'psk_inv_fail' } }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_FAILED);
    });

    it('maps subscription.disable to SUBSCRIPTION_CANCELLED', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({ event: 'subscription.disable', data: { id: 3, subscription_code: 'SUB_1' } }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.SUBSCRIPTION_CANCELLED);
      expect(event.providerSubscriptionId).toBe('SUB_1');
    });

    it('maps unknown events to UNKNOWN safely (no throw)', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ event: 'transfer.success', data: { id: 4 } }));
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.UNKNOWN);
    });

    it('handles unparseable JSON safely (no throw)', () => {
      const provider = buildProvider();
      const event = provider.parseWebhookEvent(Buffer.from('not json'), {});
      expect(event.eventType).toBe(PaymentEventType.UNKNOWN);
      expect(event.providerEventId).toContain('paystack_unparseable');
    });

    it('produces a stable providerEventId for the same event+id (idempotency)', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ event: 'charge.success', data: { id: 999 } }));
      const first = provider.parseWebhookEvent(rawBody, {});
      const second = provider.parseWebhookEvent(rawBody, {});
      expect(first.providerEventId).toBe(second.providerEventId);
    });
  });

  describe('getTransactionStatus', () => {
    function buildProvider(http: PaystackHttpClient & { request: jest.Mock }) {
      return new PaystackPaymentProvider(buildConfigService({ enabled: true, secretKey: SECRET_KEY }), http);
    }

    it('maps a successful transaction', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          status: true,
          data: { status: 'success', amount: 50000, currency: 'GHS', paid_at: '2026-01-01T00:00:00.000Z' },
        },
      });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('psk_abc');
      expect(status.status).toBe('SUCCEEDED');
      expect(status.amountMinor).toBe(50000);
      expect(status.paidAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
    });

    it('maps a pending transaction', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { status: true, data: { status: 'pending' } } });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('psk_pending');
      expect(status.status).toBe('PROCESSING');
    });

    it('maps a failed transaction safely (no raw provider response exposed)', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: { status: true, data: { status: 'failed', gateway_response: 'Insufficient funds' } },
      });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('psk_failed');
      expect(status.status).toBe('FAILED');
      expect(status.failureCode).toBe('PAYSTACK_CHARGE_FAILED');
      expect(status.failureMessage).toBe('Insufficient funds');
    });

    it('returns FAILED (never throws) when the verify call itself fails', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: false, status: 404, body: null, errorMessage: 'Transaction not found' });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('unknown_ref');
      expect(status.status).toBe('FAILED');
      expect(status.failureMessage).toBe('Transaction not found');
    });
  });

  describe('optional methods remain fail-closed', () => {
    it('refundPayment, cancelSubscription, createCustomer throw NotImplementedException', async () => {
      const provider = new PaystackPaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      await expect(provider.refundPayment('ref')).rejects.toThrow();
      await expect(provider.cancelSubscription('sub')).rejects.toThrow();
      await expect(provider.createCustomer({ userId: 'u1', email: 'u@test.com' })).rejects.toThrow();
    });
  });
});
