import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BasePaymentProvider } from './base-provider';
import { PaystackHttpClient } from './paystack-http.client';
import {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResult,
  PaymentEventType,
  PaymentProviderTransactionStatus,
  ProviderWebhookEvent,
} from '../interfaces/payment-provider.interface';

const PAYSTACK_SIGNATURE_HEADER = 'x-paystack-signature';
const MAX_ERROR_MESSAGE_LENGTH = 300;

/** Only these metadata keys are ever sent to Paystack or read back from a webhook. */
const SAFE_METADATA_KEYS = [
  'internalTransactionId',
  'invoiceId',
  'subscriptionId',
  'assessmentId',
  'paymentPurpose',
  'userId',
  'planId',
] as const;

interface PaystackInitializeResponseData {
  authorization_url?: string;
  access_code?: string;
  reference?: string;
}

interface PaystackVerifyResponseData {
  status?: string;
  reference?: string;
  amount?: number;
  currency?: string;
  paid_at?: string | null;
  gateway_response?: string;
  channel?: string;
}

interface PaystackWebhookData {
  id?: number | string;
  reference?: string;
  amount?: number;
  currency?: string;
  status?: string;
  customer?: { customer_code?: string; email?: string };
  subscription_code?: string;
  metadata?: Record<string, unknown> | string;
}

/**
 * PaystackPaymentProvider — Sprint 15 sandbox implementation.
 *
 * Supports: GH, NG, KE, ZA — Africa-first coverage.
 * Currencies: GHS, NGN, KES, ZAR, USD.
 *
 * Reference: https://paystack.com/docs/api/ (Transaction Initialize/Verify, Webhooks).
 *
 * HARD RULES (never violated by this class):
 * - Fails closed when PAYSTACK_ENABLED=false or PAYSTACK_SECRET_KEY is missing.
 * - `createCheckoutSession` NEVER marks anything paid — it only returns a checkout
 *   URL/reference. Paid/HWM state changes happen exclusively via the verified
 *   webhook path in `WebhookProcessorService`.
 * - `verifyWebhookSignature` fails closed on missing signature header, missing
 *   secret, or missing raw body, and never logs the secret/signature/raw body.
 * - `parseWebhookEvent` never persists the raw webhook payload — only a
 *   whitelisted-key metadata subset and provider-safe scalars are extracted.
 * - No raw card data or mobile money PINs are ever read, stored, or forwarded.
 */
@Injectable()
export class PaystackPaymentProvider extends BasePaymentProvider {
  private readonly logger = new Logger(PaystackPaymentProvider.name);

  readonly providerId = 'paystack';
  readonly displayName = 'Paystack';
  readonly supportedCountries = ['GH', 'NG', 'KE', 'ZA'];
  readonly supportedCurrencies = ['GHS', 'NGN', 'KES', 'ZAR', 'USD'];
  readonly supportedPaymentMethods = ['card', 'mobile_money', 'bank_transfer'];
  /** True only when explicitly enabled AND a secret key is configured. */
  readonly isLive: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: PaystackHttpClient,
  ) {
    super();
    this.isLive = this.isEnabled() && Boolean(this.getSecretKey());
  }

  // ── Config helpers ──────────────────────────────────────────────────────────

  private isEnabled(): boolean {
    return this.configService.get<boolean>('paystack.enabled', false) === true;
  }

  private getSecretKey(): string | undefined {
    return this.configService.get<string>('paystack.secretKey') || undefined;
  }

  private getWebhookSecret(): string | undefined {
    // Paystack signs webhooks with the account's secret key; a dedicated
    // PAYSTACK_WEBHOOK_SECRET is supported for deployments that configure one,
    // falling back to the secret key per Paystack's documented behaviour.
    return this.configService.get<string>('paystack.webhookSecret') || this.getSecretKey();
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('paystack.baseUrl', 'https://api.paystack.co');
  }

  private getCallbackUrl(): string | undefined {
    return this.configService.get<string>('paystack.callbackUrl') || undefined;
  }

  /** Fail closed — throws a safe, secret-free error if not usable. */
  private assertConfigured(): string {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Paystack is not enabled');
    }
    const secretKey = this.getSecretKey();
    if (!secretKey) {
      throw new ServiceUnavailableException('Paystack is not configured');
    }
    return secretKey;
  }

  // ── Checkout ────────────────────────────────────────────────────────────────

  async createCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResult> {
    const secretKey = this.assertConfigured();

    // Stable, provider-scoped reference — never reused across sessions.
    const reference = `psk_${uuidv4()}`;

    const body: Record<string, unknown> = {
      email: request.email,
      amount: Math.round(request.amountMinor),
      currency: request.currency,
      reference,
      metadata: this.buildOutboundMetadata(request),
    };

    const callbackUrl = request.successUrl ?? this.getCallbackUrl();
    if (callbackUrl) {
      body.callback_url = callbackUrl;
    }

    const result = await this.httpClient.request<{ data?: PaystackInitializeResponseData }>(
      `${this.getBaseUrl()}/transaction/initialize`,
      { method: 'POST', secretKey, body },
    );

    if (!result.ok || !result.body?.data?.reference || !result.body.data.authorization_url) {
      throw new BadRequestException(
        this.safeMessage(result.errorMessage) ?? 'Paystack checkout initialization failed',
      );
    }

    return {
      sessionId: result.body.data.reference,
      checkoutUrl: result.body.data.authorization_url,
      providerTransactionReference: result.body.data.reference,
      provider: this.providerId,
    };
  }

  /** Builds the safe metadata payload sent to Paystack — never includes secrets. */
  private buildOutboundMetadata(request: CreateCheckoutSessionRequest): Record<string, string> {
    const meta: Record<string, string> = { userId: request.userId };

    const transactionId = request.metadata?.['transactionId'];
    if (typeof transactionId === 'string' && transactionId) {
      meta.internalTransactionId = transactionId;
    }

    if (request.invoiceId) {
      meta.invoiceId = request.invoiceId;
    }

    const subscriptionId = request.metadata?.['subscriptionId'];
    if (typeof subscriptionId === 'string' && subscriptionId) {
      meta.subscriptionId = subscriptionId;
    }

    const assessmentId = request.metadata?.['assessmentId'];
    if (typeof assessmentId === 'string' && assessmentId) {
      meta.assessmentId = assessmentId;
    }

    const type = request.metadata?.['type'];
    meta.paymentPurpose = typeof type === 'string' && type ? type : 'SUBSCRIPTION';

    if (request.planId) {
      meta.planId = request.planId;
    }

    return meta;
  }

  // ── Webhook signature verification ─────────────────────────────────────────

  /**
   * Verifies the `x-paystack-signature` header: HMAC-SHA512 of the raw request
   * body, keyed with the configured secret, per Paystack's webhook docs.
   * Fails closed on any missing input and never logs secret/signature/body.
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    if (!this.isEnabled()) return false;

    const secret = this.getWebhookSecret();
    if (!secret) return false;

    if (!rawBody || rawBody.length === 0) return false;

    const headerValue = headers[PAYSTACK_SIGNATURE_HEADER];
    const signature = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!signature) return false;

    try {
      const expected = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');
      const providedBuf = Buffer.from(signature, 'utf8');
      if (expectedBuf.length !== providedBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, providedBuf);
    } catch {
      // Any parsing/crypto error must fail closed, never throw.
      return false;
    }
  }

  // ── Webhook event parsing ───────────────────────────────────────────────────

  /**
   * Parses a Paystack webhook payload into a normalised ProviderWebhookEvent.
   * Must only be called AFTER verifyWebhookSignature() returns true.
   * Never stores/returns the raw payload — only whitelisted scalar/metadata fields.
   */
  parseWebhookEvent(
    rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    let payload: { event?: string; data?: PaystackWebhookData } | null = null;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return {
        eventType: PaymentEventType.UNKNOWN,
        providerEventId: `paystack_unparseable_${Date.now()}`,
      };
    }

    const eventName = payload?.event;
    const data = payload?.data ?? {};

    const base: ProviderWebhookEvent = {
      eventType: PaymentEventType.UNKNOWN,
      providerEventId: this.buildProviderEventId(eventName, data),
      providerTransactionReference: typeof data.reference === 'string' ? data.reference : undefined,
      providerCustomerId: data.customer?.customer_code,
      amountMinor: typeof data.amount === 'number' ? data.amount : undefined,
      currency: typeof data.currency === 'string' ? data.currency : undefined,
      metadata: this.safeInboundMetadata(data.metadata),
    };

    switch (eventName) {
      case 'charge.success':
        return { ...base, eventType: PaymentEventType.PAYMENT_SUCCEEDED };

      case 'charge.failed':
      case 'invoice.payment_failed':
        return { ...base, eventType: PaymentEventType.PAYMENT_FAILED };

      case 'subscription.disable':
        return {
          ...base,
          eventType: PaymentEventType.SUBSCRIPTION_CANCELLED,
          providerSubscriptionId: data.subscription_code,
        };

      default:
        this.logger.log(`[Paystack] Unhandled webhook event type: ${eventName ?? 'unknown'}`);
        return base;
    }
  }

  /**
   * Paystack does not send a dedicated event id in its webhook payload (unlike
   * Stripe's `evt_...`). A stable idempotency key is derived from the event type
   * and the provider transaction id, which Paystack retries unchanged.
   */
  private buildProviderEventId(eventName: string | undefined, data: PaystackWebhookData): string {
    const dataId = data.id ?? data.reference ?? 'unknown';
    return `paystack_${eventName ?? 'unknown'}_${dataId}`;
  }

  private safeInboundMetadata(
    metadata: Record<string, unknown> | string | undefined,
  ): Record<string, unknown> | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const safe: Record<string, unknown> = {};
    for (const key of SAFE_METADATA_KEYS) {
      if (key in metadata && typeof (metadata as Record<string, unknown>)[key] === 'string') {
        safe[key] = (metadata as Record<string, unknown>)[key];
      }
    }
    return Object.keys(safe).length > 0 ? safe : undefined;
  }

  // ── Transaction status (server-side confirmation only) ─────────────────────

  /**
   * Calls Paystack's Verify Transaction endpoint for server-side status checks.
   * Read-only — never marks anything paid. The verified webhook remains the
   * only path that transitions a transaction/invoice/assessment to paid.
   */
  async getTransactionStatus(providerReference: string): Promise<PaymentProviderTransactionStatus> {
    const secretKey = this.assertConfigured();

    const result = await this.httpClient.request<{ data?: PaystackVerifyResponseData }>(
      `${this.getBaseUrl()}/transaction/verify/${encodeURIComponent(providerReference)}`,
      { method: 'GET', secretKey },
    );

    if (!result.ok || !result.body?.data) {
      return {
        providerReference,
        status: 'FAILED',
        failureMessage: this.safeMessage(result.errorMessage) ?? 'Unable to verify transaction status',
      };
    }

    const data = result.body.data;
    return {
      providerReference,
      status: this.mapTransactionStatus(data.status),
      amountMinor: typeof data.amount === 'number' ? data.amount : undefined,
      currency: typeof data.currency === 'string' ? data.currency : undefined,
      paidAt: data.paid_at ? new Date(data.paid_at) : undefined,
      failureCode: data.status === 'failed' ? 'PAYSTACK_CHARGE_FAILED' : undefined,
      failureMessage: data.status === 'failed' ? this.safeMessage(data.gateway_response) : undefined,
    };
  }

  private mapTransactionStatus(status: string | undefined): PaymentProviderTransactionStatus['status'] {
    switch (status) {
      case 'success':
        return 'SUCCEEDED';
      case 'failed':
        return 'FAILED';
      case 'abandoned':
        return 'CANCELLED';
      case 'reversed':
        return 'REFUNDED';
      case 'pending':
      case 'ongoing':
      case 'processing':
      case 'queued':
        return 'PROCESSING';
      default:
        return 'PENDING';
    }
  }

  /** Truncates any provider-supplied message before it can reach logs/responses. */
  private safeMessage(message?: string | null): string | undefined {
    if (!message) return undefined;
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
}
