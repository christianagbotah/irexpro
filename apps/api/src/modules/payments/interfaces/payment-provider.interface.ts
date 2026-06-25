/**
 * IPaymentProvider — Core payment provider abstraction for iRexPro.
 *
 * All payment provider implementations (Stripe, Paystack, Flutterwave,
 * Hubtel, PayPal, Wise, etc.) must implement this interface.
 *
 * RULE: Services must NEVER call provider SDKs directly.
 * Always interact through this interface via PaymentProviderRegistry.
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

  /**
   * Create or retrieve a customer record at the provider for a given user.
   * Must be idempotent — calling twice for the same user returns the same reference.
   */
  createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult>;

  /** Create a subscription at the provider */
  createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;

  /** Cancel a subscription at the provider */
  cancelSubscription(providerSubscriptionId: string): Promise<void>;

  /** Create a one-time payment intent (e.g., for performance fee collection) */
  createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;

  /** Validate an incoming webhook payload. Must be called BEFORE processing. */
  validateWebhookSignature(rawBody: Buffer, signature: string): boolean;

  /** Parse a validated webhook payload into a normalised event */
  parseWebhookEvent(rawBody: Buffer): ProviderWebhookEvent;
}

export interface CreateCustomerParams {
  userId: string;
  email: string;
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
  amountCents?: number;
  currency?: string;
  metadata?: Record<string, unknown>;
  raw?: Record<string, unknown>;
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
