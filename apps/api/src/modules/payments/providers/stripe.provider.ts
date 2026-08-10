import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { BasePaymentProvider } from './base-provider';
import { StripeHttpClient } from './stripe-http.client';
import {
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResult,
  PaymentEventType,
  PaymentProviderTransactionStatus,
  ProviderWebhookEvent,
} from '../interfaces/payment-provider.interface';

const STRIPE_SIGNATURE_HEADER = 'stripe-signature';
const MAX_ERROR_MESSAGE_LENGTH = 300;
/** Stripe's own recommended replay-protection tolerance for webhook timestamps. */
const WEBHOOK_TOLERANCE_SECONDS = 300;

/** Only these metadata keys are ever sent to Stripe or read back from a webhook. */
const SAFE_METADATA_KEYS = [
  'internalTransactionId',
  'invoiceId',
  'subscriptionId',
  'assessmentId',
  'paymentPurpose',
  'userId',
  'planId',
] as const;

interface StripeCheckoutSessionResponse {
  id?: string;
  url?: string;
  status?: string;
  payment_status?: string;
  amount_total?: number;
  currency?: string;
  customer?: string;
  payment_intent?: string;
  metadata?: Record<string, unknown>;
}

interface StripePaymentIntentResponse {
  id?: string;
  status?: string;
  amount?: number;
  currency?: string;
  last_payment_error?: { message?: string };
  metadata?: Record<string, unknown>;
}

interface StripeWebhookEvent {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

/**
 * StripePaymentProvider — Sprint 17 sandbox implementation.
 *
 * Supports: US, GB, CA, AU, SG, AE, DE, FR, NL, IE, NG, KE, GH, ZA.
 * Currencies: USD, GBP, EUR, AUD, CAD, SGD, AED, NGN, KES, GHS, ZAR.
 *
 * Uses Stripe Checkout Sessions in `mode: 'payment'` (one-time payment) for both
 * subscription and performance-fee checkout, consistent with the existing
 * provider-agnostic checkout flow (SubscriptionsService / PerformanceFeePaymentService
 * never rely on a provider-native recurring subscription object — billing period
 * renewal is orchestrated internally and re-invoked as a fresh checkout each cycle).
 *
 * Reference: https://stripe.com/docs/api/checkout/sessions,
 *            https://stripe.com/docs/webhooks/signatures.
 *
 * HARD RULES (never violated by this class):
 * - Fails closed when STRIPE_ENABLED=false or STRIPE_SECRET_KEY is missing.
 * - `createCheckoutSession` NEVER marks anything paid — it only returns a checkout
 *   URL/session id. Paid/HWM state changes happen exclusively via the verified
 *   webhook path in `WebhookProcessorService`.
 * - `verifyWebhookSignature` fails closed on missing signature header, missing
 *   secret, missing raw body, or a stale/malformed timestamp, and never logs the
 *   secret/signature/raw body.
 * - `parseWebhookEvent` never persists the raw webhook payload — only a
 *   whitelisted-key metadata subset and provider-safe scalars are extracted.
 * - No raw card data is ever read, stored, or forwarded.
 */
@Injectable()
export class StripePaymentProvider extends BasePaymentProvider {
  private readonly logger = new Logger(StripePaymentProvider.name);

  readonly providerId = 'stripe';
  readonly displayName = 'Stripe';
  readonly supportedCountries = [
    'GB',
    'US',
    'CA',
    'AU',
    'SG',
    'AE',
    'DE',
    'FR',
    'NL',
    'IE',
    'NG',
    'KE',
    'GH',
    'ZA',
  ];
  readonly supportedCurrencies = [
    'GBP',
    'USD',
    'EUR',
    'AUD',
    'CAD',
    'SGD',
    'AED',
    'NGN',
    'KES',
    'GHS',
    'ZAR',
  ];
  readonly supportedPaymentMethods = ['card'];
  /** True only when explicitly enabled AND a secret key is configured. */
  readonly isLive: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpClient: StripeHttpClient,
  ) {
    super();
    this.isLive = this.isEnabled() && Boolean(this.getSecretKey());
  }

  // ── Config helpers ──────────────────────────────────────────────────────────

  private isEnabled(): boolean {
    return this.configService.get<boolean>('stripe.enabled', false) === true;
  }

  private getSecretKey(): string | undefined {
    return this.configService.get<string>('stripe.secretKey') || undefined;
  }

  private getWebhookSecret(): string | undefined {
    return this.configService.get<string>('stripe.webhookSecret') || undefined;
  }

  private getBaseUrl(): string {
    return this.configService.get<string>('stripe.baseUrl', 'https://api.stripe.com');
  }

  private getSuccessUrl(): string | undefined {
    return this.configService.get<string>('stripe.successUrl') || undefined;
  }

  private getCancelUrl(): string | undefined {
    return this.configService.get<string>('stripe.cancelUrl') || undefined;
  }

  /** Fail closed — throws a safe, secret-free error if not usable. */
  private assertConfigured(): string {
    if (!this.isEnabled()) {
      throw new ServiceUnavailableException('Stripe is not enabled');
    }
    const secretKey = this.getSecretKey();
    if (!secretKey) {
      throw new ServiceUnavailableException('Stripe is not configured');
    }
    return secretKey;
  }

  // ── Checkout ────────────────────────────────────────────────────────────────

  async createCheckoutSession(
    request: CreateCheckoutSessionRequest,
  ): Promise<CreateCheckoutSessionResult> {
    const secretKey = this.assertConfigured();

    const successUrl = request.successUrl ?? this.getSuccessUrl();
    const cancelUrl = request.cancelUrl ?? this.getCancelUrl();
    if (!successUrl || !cancelUrl) {
      throw new BadRequestException(
        'Stripe checkout requires success_url/cancel_url to be configured',
      );
    }

    const body: Record<string, unknown> = {
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: request.userId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            // Stripe requires lowercase ISO currency codes; the rest of the
            // system stores/compares currency uppercase — normalise at the boundary.
            currency: request.currency.toLowerCase(),
            unit_amount: Math.round(request.amountMinor),
            product_data: { name: this.buildProductName(request) },
          },
        },
      ],
      metadata: this.buildOutboundMetadata(request),
    };

    if (request.email) {
      body.customer_email = request.email;
    }

    const result = await this.httpClient.request<StripeCheckoutSessionResponse>(
      `${this.getBaseUrl()}/v1/checkout/sessions`,
      { method: 'POST', secretKey, body },
    );

    if (!result.ok || !result.body?.id || !result.body.url) {
      throw new BadRequestException(
        this.safeMessage(result.errorMessage) ?? 'Stripe checkout session creation failed',
      );
    }

    return {
      sessionId: result.body.id,
      checkoutUrl: result.body.url,
      providerTransactionReference: result.body.id,
      provider: this.providerId,
    };
  }

  private buildProductName(request: CreateCheckoutSessionRequest): string {
    const type = request.metadata?.['type'];
    if (type === 'PERFORMANCE_FEE') {
      return 'iRexPro Performance Fee';
    }
    return request.planId ? `iRexPro Subscription — ${request.planId}` : 'iRexPro Subscription';
  }

  /** Builds the safe metadata payload sent to Stripe — never includes secrets. */
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
   * Verifies the `Stripe-Signature` header per Stripe's documented scheme:
   * HMAC-SHA256 of `${timestamp}.${rawBody}`, keyed with the webhook signing
   * secret, compared against every `v1=` value in the header (Stripe sends
   * multiple during secret rotation). Also enforces a timestamp tolerance to
   * reject stale/replayed payloads. Fails closed on any missing input and
   * never logs the secret/signature/raw body.
   */
  verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    if (!this.isEnabled()) return false;

    const secret = this.getWebhookSecret();
    if (!secret) return false;

    if (!rawBody || rawBody.length === 0) return false;

    const headerValue = headers[STRIPE_SIGNATURE_HEADER];
    const signatureHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (!signatureHeader) return false;

    try {
      const { timestamp, signatures } = this.parseSignatureHeader(signatureHeader);
      if (!timestamp || signatures.length === 0) return false;

      const nowSeconds = Math.floor(Date.now() / 1000);
      if (Math.abs(nowSeconds - timestamp) > WEBHOOK_TOLERANCE_SECONDS) return false;

      const signedPayload = `${timestamp}.${rawBody.toString('utf8')}`;
      const expected = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');
      const expectedBuf = Buffer.from(expected, 'utf8');

      return signatures.some((sig) => {
        const providedBuf = Buffer.from(sig, 'utf8');
        return (
          providedBuf.length === expectedBuf.length &&
          crypto.timingSafeEqual(providedBuf, expectedBuf)
        );
      });
    } catch {
      // Any parsing/crypto error must fail closed, never throw.
      return false;
    }
  }

  /** Parses `t=169...,v1=abc...,v1=def...` into a timestamp and candidate signatures. */
  private parseSignatureHeader(header: string): { timestamp: number | null; signatures: string[] } {
    let timestamp: number | null = null;
    const signatures: string[] = [];

    for (const part of header.split(',')) {
      const [key, value] = part.split('=');
      if (!key || value === undefined) continue;
      const trimmedKey = key.trim();
      if (trimmedKey === 't') {
        const parsed = Number(value.trim());
        timestamp = Number.isFinite(parsed) ? parsed : null;
      } else if (trimmedKey === 'v1') {
        signatures.push(value.trim());
      }
    }

    return { timestamp, signatures };
  }

  // ── Webhook event parsing ───────────────────────────────────────────────────

  /**
   * Parses a Stripe webhook payload into a normalised ProviderWebhookEvent.
   * Must only be called AFTER verifyWebhookSignature() returns true.
   * Never stores/returns the raw payload — only whitelisted scalar/metadata fields.
   */
  parseWebhookEvent(
    rawBody: Buffer,
    _headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent {
    let payload: StripeWebhookEvent | null = null;
    try {
      payload = JSON.parse(rawBody.toString('utf8'));
    } catch {
      return {
        eventType: PaymentEventType.UNKNOWN,
        providerEventId: `stripe_unparseable_${Date.now()}`,
      };
    }

    const eventType = payload?.type;
    const dataObject = payload?.data?.object ?? {};
    // Stripe sends a stable, dedicated `evt_...` id with every event — unlike
    // Paystack, no derived fallback id is needed for webhook idempotency.
    const providerEventId =
      typeof payload?.id === 'string' && payload.id ? payload.id : `stripe_unknown_${Date.now()}`;

    switch (eventType) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        const session = dataObject as StripeCheckoutSessionResponse;
        const paid =
          session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
        return {
          eventType: paid ? PaymentEventType.PAYMENT_SUCCEEDED : PaymentEventType.UNKNOWN,
          providerEventId,
          providerTransactionReference: typeof session.id === 'string' ? session.id : undefined,
          providerCustomerId: typeof session.customer === 'string' ? session.customer : undefined,
          amountMinor: typeof session.amount_total === 'number' ? session.amount_total : undefined,
          currency: typeof session.currency === 'string' ? session.currency : undefined,
          metadata: this.safeInboundMetadata(session.metadata),
        };
      }

      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed': {
        const session = dataObject as StripeCheckoutSessionResponse;
        return {
          eventType: PaymentEventType.PAYMENT_FAILED,
          providerEventId,
          providerTransactionReference: typeof session.id === 'string' ? session.id : undefined,
          metadata: this.safeInboundMetadata(session.metadata),
        };
      }

      case 'payment_intent.succeeded': {
        const intent = dataObject as StripePaymentIntentResponse;
        return {
          eventType: PaymentEventType.PAYMENT_SUCCEEDED,
          providerEventId,
          providerTransactionReference: typeof intent.id === 'string' ? intent.id : undefined,
          amountMinor: typeof intent.amount === 'number' ? intent.amount : undefined,
          currency: typeof intent.currency === 'string' ? intent.currency : undefined,
          metadata: this.safeInboundMetadata(intent.metadata),
        };
      }

      case 'payment_intent.payment_failed': {
        const intent = dataObject as StripePaymentIntentResponse;
        return {
          eventType: PaymentEventType.PAYMENT_FAILED,
          providerEventId,
          providerTransactionReference: typeof intent.id === 'string' ? intent.id : undefined,
          metadata: this.safeInboundMetadata(intent.metadata),
        };
      }

      default:
        this.logger.log(`[Stripe] Unhandled webhook event type: ${eventType ?? 'unknown'}`);
        return { eventType: PaymentEventType.UNKNOWN, providerEventId };
    }
  }

  private safeInboundMetadata(
    metadata: Record<string, unknown> | undefined,
  ): Record<string, unknown> | undefined {
    if (!metadata || typeof metadata !== 'object') return undefined;
    const safe: Record<string, unknown> = {};
    for (const key of SAFE_METADATA_KEYS) {
      if (key in metadata && typeof metadata[key] === 'string') {
        safe[key] = metadata[key];
      }
    }
    return Object.keys(safe).length > 0 ? safe : undefined;
  }

  // ── Transaction status (server-side confirmation only) ─────────────────────

  /**
   * Retrieves a Checkout Session (`cs_...`) or PaymentIntent (`pi_...`) by
   * reference and returns a mapped, safe status. Read-only — never marks
   * anything paid. The verified webhook remains the only path that transitions
   * a transaction/invoice/assessment to paid.
   */
  async getTransactionStatus(providerReference: string): Promise<PaymentProviderTransactionStatus> {
    const secretKey = this.assertConfigured();

    if (providerReference.startsWith('pi_')) {
      return this.getPaymentIntentStatus(providerReference, secretKey);
    }
    return this.getCheckoutSessionStatus(providerReference, secretKey);
  }

  private async getCheckoutSessionStatus(
    providerReference: string,
    secretKey: string,
  ): Promise<PaymentProviderTransactionStatus> {
    const result = await this.httpClient.request<StripeCheckoutSessionResponse>(
      `${this.getBaseUrl()}/v1/checkout/sessions/${encodeURIComponent(providerReference)}`,
      { method: 'GET', secretKey },
    );

    if (!result.ok || !result.body) {
      return {
        providerReference,
        status: 'FAILED',
        failureMessage:
          this.safeMessage(result.errorMessage) ?? 'Unable to verify transaction status',
      };
    }

    const data = result.body;
    return {
      providerReference,
      status: this.mapCheckoutSessionStatus(data.status, data.payment_status),
      amountMinor: typeof data.amount_total === 'number' ? data.amount_total : undefined,
      currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined,
    };
  }

  private async getPaymentIntentStatus(
    providerReference: string,
    secretKey: string,
  ): Promise<PaymentProviderTransactionStatus> {
    const result = await this.httpClient.request<StripePaymentIntentResponse>(
      `${this.getBaseUrl()}/v1/payment_intents/${encodeURIComponent(providerReference)}`,
      { method: 'GET', secretKey },
    );

    if (!result.ok || !result.body) {
      return {
        providerReference,
        status: 'FAILED',
        failureMessage:
          this.safeMessage(result.errorMessage) ?? 'Unable to verify transaction status',
      };
    }

    const data = result.body;
    const status = this.mapPaymentIntentStatus(data.status);
    return {
      providerReference,
      status,
      amountMinor: typeof data.amount === 'number' ? data.amount : undefined,
      currency: typeof data.currency === 'string' ? data.currency.toUpperCase() : undefined,
      failureCode: status === 'FAILED' ? 'STRIPE_PAYMENT_FAILED' : undefined,
      failureMessage:
        status === 'FAILED' ? this.safeMessage(data.last_payment_error?.message) : undefined,
    };
  }

  private mapCheckoutSessionStatus(
    status: string | undefined,
    paymentStatus: string | undefined,
  ): PaymentProviderTransactionStatus['status'] {
    if (status === 'expired') return 'CANCELLED';
    if (
      status === 'complete' &&
      (paymentStatus === 'paid' || paymentStatus === 'no_payment_required')
    ) {
      return 'SUCCEEDED';
    }
    return 'PENDING';
  }

  private mapPaymentIntentStatus(
    status: string | undefined,
  ): PaymentProviderTransactionStatus['status'] {
    switch (status) {
      case 'succeeded':
        return 'SUCCEEDED';
      case 'processing':
        return 'PROCESSING';
      case 'canceled':
        return 'CANCELLED';
      case 'requires_payment_method':
      case 'requires_action':
      case 'requires_confirmation':
      case 'requires_capture':
        return 'PENDING';
      default:
        return 'FAILED';
    }
  }

  /** Truncates any provider-supplied message before it can reach logs/responses. */
  private safeMessage(message?: string | null): string | undefined {
    if (!message) return undefined;
    return message.slice(0, MAX_ERROR_MESSAGE_LENGTH);
  }
}
