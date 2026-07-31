/**
 * IPaymentProvider — Core payment provider abstraction for iRexPro.
 *
 * All payment provider implementations (Stripe, Paystack, Flutterwave,
 * Hubtel, PayPal, Wise, etc.) must implement this interface.
 *
 * RULE: Services must NEVER call provider SDKs directly.
 * Always interact through this interface via PaymentProviderRegistry.
 *
 * RULE: Provider secrets must NEVER be stored in DB rows, logs, or API responses.
 * RULE: Raw card data must NEVER be stored.
 * RULE: Webhook signatures must be verified before processing any state change.
 *
 * See: docs/architecture/21-payment-provider-architecture.md
 */
export interface IPaymentProvider {
  /** Unique identifier for this provider (e.g., 'stripe', 'paystack') */
  readonly providerId: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Countries this provider supports (ISO 3166-1 alpha-2 codes) */
  readonly supportedCountries: string[];

  /** Currencies this provider can bill in (ISO 4217) */
  readonly supportedCurrencies: string[];

  /** Whether this provider is available for live use (false for placeholders) */
  readonly isLive: boolean;

  /** Payment methods summary e.g. ['card', 'mobile_money', 'bank_transfer'] */
  readonly supportedPaymentMethods: string[];

  /**
   * Create or retrieve a customer record at the provider for a given user.
   * Must be idempotent — calling twice for the same user returns the same reference.
   */
  createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult>;

  /**
   * Create a checkout session (redirect URL or inline token) for a subscription or one-time payment.
   * Returns a checkout URL or reference the frontend can use to redirect/display.
   * NEVER returns or stores raw card data.
   */
  createCheckoutSession(request: CreateCheckoutSessionRequest): Promise<CreateCheckoutSessionResult>;

  /**
   * Verify the signature on an incoming webhook.
   * Must be called BEFORE processing ANY webhook payload.
   * Must fail closed — any error or missing secret should return false.
   */
  verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;

  /**
   * Parse a verified webhook payload into a normalised event.
   * Should only be called AFTER verifyWebhookSignature returns true.
   */
  parseWebhookEvent(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): ProviderWebhookEvent;

  /** Get the current status of a transaction by provider reference */
  getTransactionStatus(providerReference: string): Promise<PaymentProviderTransactionStatus>;

  /** Cancel a subscription at the provider */
  cancelSubscription(providerSubscriptionReference: string): Promise<void>;

  /** Issue a refund for a payment, optionally partial */
  refundPayment(providerReference: string, amountMinor?: number): Promise<void>;

  /** @deprecated Use createCheckoutSession for new flows */
  createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;

  /** @deprecated Use createCheckoutSession for new flows */
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;

  /** @deprecated Use verifyWebhookSignature */
  validateWebhookSignature(rawBody: Buffer, signature: string): boolean;
}

// ─── Request / Result DTOs ────────────────────────────────────────────────────

export interface CreateCustomerParams {
  userId: string;
  email: string | undefined;
  name?: string;
  countryCode?: string;
  currency?: string;
  metadata?: Record<string, string>;
}

export interface ProviderCustomerResult {
  providerCustomerId: string;
  provider: string;
  raw?: Record<string, unknown>;
}

export interface CreateCheckoutSessionRequest {
  userId: string;
  email: string | undefined;
  planId: string;
  currency: string;
  amountMinor: number;
  countryCode: string;
  providerCustomerId?: string;
  providerPlanId?: string;
  invoiceId?: string;
  successUrl?: string;
  cancelUrl?: string;
  metadata?: Record<string, string>;
}

export interface CreateCheckoutSessionResult {
  /** Opaque provider session or payment reference */
  sessionId: string;
  /** URL to redirect user to (if redirect-based flow) */
  checkoutUrl?: string;
  /** Client-side token (if embedded flow) */
  clientToken?: string;
  /** Provider-specific transaction reference */
  providerTransactionReference?: string;
  provider: string;
  expiresAt?: Date;
}

export interface PaymentProviderTransactionStatus {
  providerReference: string;
  status: 'PENDING' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
  amountMinor?: number;
  currency?: string;
  paidAt?: Date;
  failureCode?: string;
  failureMessage?: string;
}

export interface PaymentProviderError {
  code: string;
  message: string;
  providerCode?: string;
  retryable: boolean;
}

export interface CreateSubscriptionParams {
  providerCustomerId: string;
  providerPlanId: string;
  currency: string;
  trialDays?: number;
  metadata?: Record<string, string>;
}

export interface ProviderSubscriptionResult {
  providerSubscriptionId: string;
  status: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  raw?: Record<string, unknown>;
}

export interface CreatePaymentIntentParams {
  providerCustomerId: string;
  amountCents: number;
  currency: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface ProviderPaymentIntentResult {
  providerPaymentIntentId: string;
  clientSecret?: string;
  status: string;
  raw?: Record<string, unknown>;
}

export interface ProviderWebhookEvent {
  eventType: PaymentEventType;
  providerEventId: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  providerTransactionReference?: string;
  amountMinor?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
}

export enum PaymentEventType {
  PAYMENT_SUCCEEDED = 'PAYMENT_SUCCEEDED',
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_RENEWED = 'SUBSCRIPTION_RENEWED',
  REFUND_ISSUED = 'REFUND_ISSUED',
  UNKNOWN = 'UNKNOWN',
}
