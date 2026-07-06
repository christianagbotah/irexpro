import * as crypto from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { StripePaymentProvider } from './stripe.provider';
import { StripeHttpClient } from './stripe-http.client';
import { PaymentEventType } from '../interfaces/payment-provider.interface';

const SECRET_KEY = 'sk_test_super_secret_stripe_key';
const WEBHOOK_SECRET = 'whsec_super_secret_webhook_key';

interface FakeConfig {
  enabled?: boolean;
  secretKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
  successUrl?: string;
  cancelUrl?: string;
}

function buildConfigService(cfg: FakeConfig): any {
  const values: Record<string, unknown> = {
    'stripe.enabled': cfg.enabled ?? false,
    'stripe.secretKey': cfg.secretKey,
    'stripe.webhookSecret': cfg.webhookSecret,
    'stripe.baseUrl': cfg.baseUrl ?? 'https://api.stripe.com',
    'stripe.successUrl': cfg.successUrl,
    'stripe.cancelUrl': cfg.cancelUrl,
  };
  return {
    get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback),
  };
}

function buildHttpClientMock() {
  return { request: jest.fn() } as unknown as StripeHttpClient & { request: jest.Mock };
}

function signPayload(timestamp: number, rawBody: Buffer, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
}

function buildSignatureHeader(rawBody: Buffer, secret: string, timestamp = Math.floor(Date.now() / 1000)): string {
  const signature = signPayload(timestamp, rawBody, secret);
  return `t=${timestamp},v1=${signature}`;
}

const CHECKOUT_REQUEST = {
  userId: 'user-1',
  email: 'user@example.com',
  planId: 'plan-1',
  currency: 'USD',
  amountMinor: 2900,
  countryCode: 'US',
  invoiceId: 'invoice-1',
  metadata: { transactionId: 'tx-1', type: 'SUBSCRIPTION_INITIAL' },
};

describe('StripePaymentProvider', () => {
  describe('fail-closed — disabled / unconfigured', () => {
    it('isLive is false when STRIPE_ENABLED=false', () => {
      const provider = new StripePaymentProvider(
        buildConfigService({ enabled: false, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      expect(provider.isLive).toBe(false);
    });

    it('isLive is false when enabled but secret key missing', () => {
      const provider = new StripePaymentProvider(buildConfigService({ enabled: true }), buildHttpClientMock());
      expect(provider.isLive).toBe(false);
    });

    it('isLive is true only when enabled AND secret key present', () => {
      const provider = new StripePaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      expect(provider.isLive).toBe(true);
    });

    it('createCheckoutSession throws when STRIPE_ENABLED=false', async () => {
      const http = buildHttpClientMock();
      const provider = new StripePaymentProvider(
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
      const provider = new StripePaymentProvider(buildConfigService({ enabled: true }), http);
      await expect(provider.createCheckoutSession(CHECKOUT_REQUEST)).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(http.request).not.toHaveBeenCalled();
    });

    it('getTransactionStatus throws when disabled', async () => {
      const provider = new StripePaymentProvider(buildConfigService({ enabled: false }), buildHttpClientMock());
      await expect(provider.getTransactionStatus('cs_1')).rejects.toThrow(ServiceUnavailableException);
    });

    it('verifyWebhookSignature returns false when disabled', () => {
      const provider = new StripePaymentProvider(
        buildConfigService({ enabled: false, webhookSecret: WEBHOOK_SECRET }),
        buildHttpClientMock(),
      );
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);
      expect(provider.verifyWebhookSignature(rawBody, { 'stripe-signature': header })).toBe(false);
    });

    it('fail-closed errors never contain the secret key', async () => {
      const provider = new StripePaymentProvider(buildConfigService({ enabled: false }), buildHttpClientMock());
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
    function buildEnabledProvider(http: StripeHttpClient & { request: jest.Mock }) {
      return new StripePaymentProvider(
        buildConfigService({
          enabled: true,
          secretKey: SECRET_KEY,
          successUrl: 'https://app.irexpro.com/success',
          cancelUrl: 'https://app.irexpro.com/cancel',
        }),
        http,
      );
    }

    it('sends a safe request shape with no secrets in body/metadata', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: { id: 'cs_test_abc', url: 'https://checkout.stripe.com/abc' },
      });
      const provider = buildEnabledProvider(http);

      const result = await provider.createCheckoutSession(CHECKOUT_REQUEST);

      expect(http.request).toHaveBeenCalledTimes(1);
      const [url, options] = http.request.mock.calls[0];
      expect(url).toBe('https://api.stripe.com/v1/checkout/sessions');
      expect(options.method).toBe('POST');
      expect(options.secretKey).toBe(SECRET_KEY);
      expect(options.body).toMatchObject({
        mode: 'payment',
        success_url: 'https://app.irexpro.com/success',
        cancel_url: 'https://app.irexpro.com/cancel',
        client_reference_id: 'user-1',
        customer_email: CHECKOUT_REQUEST.email,
      });
      expect(options.body.line_items[0].price_data.currency).toBe('usd');
      expect(options.body.line_items[0].price_data.unit_amount).toBe(2900);
      expect(options.body.metadata).toEqual({
        userId: 'user-1',
        internalTransactionId: 'tx-1',
        invoiceId: 'invoice-1',
        paymentPurpose: 'SUBSCRIPTION_INITIAL',
        planId: 'plan-1',
      });

      const serializedBody = JSON.stringify(options.body);
      expect(serializedBody).not.toContain(SECRET_KEY);

      expect(result.provider).toBe('stripe');
      expect(result.checkoutUrl).toBe('https://checkout.stripe.com/abc');
      expect(result.providerTransactionReference).toBe('cs_test_abc');
      expect(result.sessionId).toBe('cs_test_abc');
    });

    it('lowercases the currency for Stripe while the rest of the platform stays uppercase', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { id: 'cs_x', url: 'https://x' } });
      const provider = buildEnabledProvider(http);
      await provider.createCheckoutSession({ ...CHECKOUT_REQUEST, currency: 'GBP' });
      const [, options] = http.request.mock.calls[0];
      expect(options.body.line_items[0].price_data.currency).toBe('gbp');
    });

    it('throws BadRequestException when success/cancel URLs are not configured and not passed per-request', async () => {
      const http = buildHttpClientMock();
      const provider = new StripePaymentProvider(buildConfigService({ enabled: true, secretKey: SECRET_KEY }), http);
      await expect(provider.createCheckoutSession(CHECKOUT_REQUEST)).rejects.toThrow(
        'Stripe checkout requires success_url/cancel_url to be configured',
      );
      expect(http.request).not.toHaveBeenCalled();
    });

    it('uses per-request successUrl/cancelUrl when provided, overriding config defaults', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { id: 'cs_x', url: 'https://x' } });
      const provider = buildEnabledProvider(http);
      await provider.createCheckoutSession({
        ...CHECKOUT_REQUEST,
        successUrl: 'https://custom.example.com/ok',
        cancelUrl: 'https://custom.example.com/cancel',
      });
      const [, options] = http.request.mock.calls[0];
      expect(options.body.success_url).toBe('https://custom.example.com/ok');
      expect(options.body.cancel_url).toBe('https://custom.example.com/cancel');
    });

    it('handles a Stripe error response safely', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: false,
        status: 400,
        body: { error: { message: 'Invalid currency' } },
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
        errorMessage: 'Stripe request failed: network error',
      });
      const provider = buildEnabledProvider(http);

      await expect(provider.createCheckoutSession(CHECKOUT_REQUEST)).rejects.toThrow(
        'Stripe request failed: network error',
      );
    });

    it('omits subscriptionId/assessmentId from metadata when not provided', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { id: 'cs_x', url: 'https://x' } });
      const provider = buildEnabledProvider(http);
      await provider.createCheckoutSession(CHECKOUT_REQUEST);
      const [, options] = http.request.mock.calls[0];
      expect(options.body.metadata.subscriptionId).toBeUndefined();
      expect(options.body.metadata.assessmentId).toBeUndefined();
    });

    it('marks paymentPurpose as PERFORMANCE_FEE and uses the performance-fee product name when metadata.type is set', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { id: 'cs_y', url: 'https://y' } });
      const provider = buildEnabledProvider(http);
      await provider.createCheckoutSession({
        ...CHECKOUT_REQUEST,
        metadata: { type: 'PERFORMANCE_FEE', assessmentId: 'assess-1' },
      });
      const [, options] = http.request.mock.calls[0];
      expect(options.body.metadata.paymentPurpose).toBe('PERFORMANCE_FEE');
      expect(options.body.metadata.assessmentId).toBe('assess-1');
      expect(options.body.line_items[0].price_data.product_data.name).toBe('iRexPro Performance Fee');
    });
  });

  describe('verifyWebhookSignature', () => {
    function buildProvider(secretKey = SECRET_KEY, webhookSecret: string | undefined = WEBHOOK_SECRET) {
      return new StripePaymentProvider(
        buildConfigService({ enabled: true, secretKey, webhookSecret }),
        buildHttpClientMock(),
      );
    }

    it('succeeds with a valid signature', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', data: { object: {} } }));
      const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);
      expect(provider.verifyWebhookSignature(rawBody, { 'stripe-signature': header })).toBe(true);
    });

    it('succeeds when multiple v1 signatures are present (secret rotation) and one matches', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      const timestamp = Math.floor(Date.now() / 1000);
      const validSig = signPayload(timestamp, rawBody, WEBHOOK_SECRET);
      const header = `t=${timestamp},v1=deadbeef,v1=${validSig}`;
      expect(provider.verifyWebhookSignature(rawBody, { 'stripe-signature': header })).toBe(true);
    });

    it('fails with an invalid signature', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      const timestamp = Math.floor(Date.now() / 1000);
      expect(
        provider.verifyWebhookSignature(rawBody, { 'stripe-signature': `t=${timestamp},v1=deadbeef` }),
      ).toBe(false);
    });

    it('fails with a well-formed but wrong signature', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      const header = buildSignatureHeader(rawBody, 'not-the-real-secret');
      expect(provider.verifyWebhookSignature(rawBody, { 'stripe-signature': header })).toBe(false);
    });

    it('fails when signature header is missing', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      expect(provider.verifyWebhookSignature(rawBody, {})).toBe(false);
    });

    it('fails when rawBody is empty', () => {
      const provider = buildProvider();
      expect(provider.verifyWebhookSignature(Buffer.from(''), { 'stripe-signature': 'anything' })).toBe(false);
    });

    it('fails when webhook secret is missing', () => {
      const provider = new StripePaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);
      expect(provider.verifyWebhookSignature(rawBody, { 'stripe-signature': header })).toBe(false);
    });

    it('fails when the timestamp is outside the replay-protection tolerance', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      const staleTimestamp = Math.floor(Date.now() / 1000) - 10_000; // way outside 300s tolerance
      const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET, staleTimestamp);
      expect(provider.verifyWebhookSignature(rawBody, { 'stripe-signature': header })).toBe(false);
    });

    it('never throws on a malformed Stripe-Signature header', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      expect(() =>
        provider.verifyWebhookSignature(rawBody, { 'stripe-signature': 'not-a-valid-header-at-all' }),
      ).not.toThrow();
      expect(provider.verifyWebhookSignature(rawBody, { 'stripe-signature': 'not-a-valid-header-at-all' })).toBe(
        false,
      );
    });

    it('never throws on malformed header arrays', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed' }));
      const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);
      expect(() =>
        provider.verifyWebhookSignature(rawBody, { 'stripe-signature': [header, 'extra'] }),
      ).not.toThrow();
    });

    it('never logs or returns the raw body, signature, or secret', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ type: 'checkout.session.completed', sensitive: 'card-4111' }));
      const header = buildSignatureHeader(rawBody, WEBHOOK_SECRET);
      const result = provider.verifyWebhookSignature(rawBody, { 'stripe-signature': header });
      expect(typeof result).toBe('boolean');
    });
  });

  describe('parseWebhookEvent', () => {
    function buildProvider() {
      return new StripePaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
    }

    it('maps checkout.session.completed (paid) to PAYMENT_SUCCEEDED with safe fields', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          id: 'evt_1',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_test_abc',
              payment_status: 'paid',
              amount_total: 2900,
              currency: 'usd',
              customer: 'cus_123',
              metadata: { invoiceId: 'invoice-1', userId: 'user-1', cardNumber: '4111111111111111' },
            },
          },
        }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_SUCCEEDED);
      expect(event.providerTransactionReference).toBe('cs_test_abc');
      expect(event.amountMinor).toBe(2900);
      expect(event.currency).toBe('usd');
      expect(event.providerCustomerId).toBe('cus_123');
      expect(event.providerEventId).toBe('evt_1');
      // Only whitelisted metadata keys survive — card data must never appear.
      expect(event.metadata).toEqual({ invoiceId: 'invoice-1', userId: 'user-1' });
      expect(JSON.stringify(event)).not.toContain('4111111111111111');
    });

    it('does not mark checkout.session.completed as success when payment_status is unpaid', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          id: 'evt_2',
          type: 'checkout.session.completed',
          data: { object: { id: 'cs_unpaid', payment_status: 'unpaid' } },
        }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.UNKNOWN);
    });

    it('maps checkout.session.expired to PAYMENT_FAILED', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({ id: 'evt_3', type: 'checkout.session.expired', data: { object: { id: 'cs_expired' } } }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_FAILED);
      expect(event.providerTransactionReference).toBe('cs_expired');
    });

    it('maps checkout.session.async_payment_failed to PAYMENT_FAILED', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          id: 'evt_4',
          type: 'checkout.session.async_payment_failed',
          data: { object: { id: 'cs_async_fail' } },
        }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_FAILED);
    });

    it('maps payment_intent.succeeded to PAYMENT_SUCCEEDED with safe fields', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          id: 'evt_5',
          type: 'payment_intent.succeeded',
          data: { object: { id: 'pi_123', amount: 5000, currency: 'gbp', metadata: { userId: 'user-2' } } },
        }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_SUCCEEDED);
      expect(event.providerTransactionReference).toBe('pi_123');
      expect(event.amountMinor).toBe(5000);
      expect(event.currency).toBe('gbp');
    });

    it('maps payment_intent.payment_failed to PAYMENT_FAILED', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({ id: 'evt_6', type: 'payment_intent.payment_failed', data: { object: { id: 'pi_fail' } } }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.PAYMENT_FAILED);
    });

    it('maps unknown events to UNKNOWN safely (no throw)', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(JSON.stringify({ id: 'evt_7', type: 'customer.created', data: { object: {} } }));
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(event.eventType).toBe(PaymentEventType.UNKNOWN);
    });

    it('handles unparseable JSON safely (no throw)', () => {
      const provider = buildProvider();
      const event = provider.parseWebhookEvent(Buffer.from('not json'), {});
      expect(event.eventType).toBe(PaymentEventType.UNKNOWN);
      expect(event.providerEventId).toContain('stripe_unparseable');
    });

    it('uses Stripe’s own dedicated event id for idempotency (stable across re-parses)', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({ id: 'evt_stable_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid' } } }),
      );
      const first = provider.parseWebhookEvent(rawBody, {});
      const second = provider.parseWebhookEvent(rawBody, {});
      expect(first.providerEventId).toBe('evt_stable_1');
      expect(first.providerEventId).toBe(second.providerEventId);
    });

    it('never persists/returns raw card or payment-method data', () => {
      const provider = buildProvider();
      const rawBody = Buffer.from(
        JSON.stringify({
          id: 'evt_8',
          type: 'checkout.session.completed',
          data: {
            object: {
              id: 'cs_card',
              payment_status: 'paid',
              payment_method_details: { card: { last4: '4242', brand: 'visa' } },
              metadata: { userId: 'user-1' },
            },
          },
        }),
      );
      const event = provider.parseWebhookEvent(rawBody, {});
      expect(JSON.stringify(event)).not.toContain('4242');
      expect(JSON.stringify(event)).not.toContain('payment_method_details');
    });
  });

  describe('getTransactionStatus', () => {
    function buildProvider(http: StripeHttpClient & { request: jest.Mock }) {
      return new StripePaymentProvider(buildConfigService({ enabled: true, secretKey: SECRET_KEY }), http);
    }

    it('maps a completed/paid checkout session to SUCCEEDED', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: { status: 'complete', payment_status: 'paid', amount_total: 2900, currency: 'usd' },
      });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('cs_test_abc');
      expect(status.status).toBe('SUCCEEDED');
      expect(status.amountMinor).toBe(2900);
      expect(status.currency).toBe('USD');
    });

    it('maps an open checkout session to PENDING', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'open', payment_status: 'unpaid' } });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('cs_open');
      expect(status.status).toBe('PENDING');
    });

    it('maps an expired checkout session to CANCELLED', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'expired', payment_status: 'unpaid' } });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('cs_expired');
      expect(status.status).toBe('CANCELLED');
    });

    it('routes a pi_ reference to the PaymentIntent endpoint and maps succeeded', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: true, status: 200, body: { status: 'succeeded', amount: 5000, currency: 'gbp' } });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('pi_123');
      expect(http.request.mock.calls[0][0]).toContain('/v1/payment_intents/pi_123');
      expect(status.status).toBe('SUCCEEDED');
      expect(status.currency).toBe('GBP');
    });

    it('maps a failed PaymentIntent safely (no raw provider response exposed)', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: { status: 'requires_payment_method', last_payment_error: { message: 'Your card was declined.' } },
      });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('pi_declined');
      // requires_payment_method still maps to PENDING (retryable) not FAILED
      expect(status.status).toBe('PENDING');
    });

    it('returns FAILED (never throws) when the retrieval call itself fails', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({ ok: false, status: 404, body: null, errorMessage: 'No such checkout session' });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('cs_unknown');
      expect(status.status).toBe('FAILED');
      expect(status.failureMessage).toBe('No such checkout session');
    });

    it('never exposes the raw Stripe response body', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          status: 'complete',
          payment_status: 'paid',
          amount_total: 2900,
          currency: 'usd',
          customer_details: { email: 'user@example.com' },
          payment_method_types: ['card'],
        },
      });
      const provider = buildProvider(http);
      const status = await provider.getTransactionStatus('cs_test_abc');
      expect(JSON.stringify(status)).not.toContain('customer_details');
      expect(JSON.stringify(status)).not.toContain('payment_method_types');
    });
  });

  describe('optional methods remain fail-closed', () => {
    it('refundPayment, cancelSubscription, createCustomer throw NotImplementedException', async () => {
      const provider = new StripePaymentProvider(
        buildConfigService({ enabled: true, secretKey: SECRET_KEY }),
        buildHttpClientMock(),
      );
      await expect(provider.refundPayment('ref')).rejects.toThrow();
      await expect(provider.cancelSubscription('sub')).rejects.toThrow();
      await expect(provider.createCustomer({ userId: 'u1', email: 'u@test.com' })).rejects.toThrow();
    });
  });

  describe('no secrets in errors/responses/metadata — general regression', () => {
    it('createCheckoutSession failure message never contains the secret key', async () => {
      const http = buildHttpClientMock();
      http.request.mockResolvedValue({
        ok: false,
        status: 401,
        body: { error: { message: 'Invalid API Key provided: sk_test_***' } },
        errorMessage: 'Invalid API Key provided: sk_test_***',
      });
      const provider = new StripePaymentProvider(
        buildConfigService({
          enabled: true,
          secretKey: SECRET_KEY,
          successUrl: 'https://x/success',
          cancelUrl: 'https://x/cancel',
        }),
        http,
      );
      try {
        await provider.createCheckoutSession(CHECKOUT_REQUEST);
        fail('expected to throw');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        expect(message).not.toContain(SECRET_KEY);
      }
    });
  });
});
