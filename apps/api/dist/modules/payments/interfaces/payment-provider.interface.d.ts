export interface IPaymentProvider {
    readonly providerId: string;
    readonly displayName: string;
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive: boolean;
    readonly supportedPaymentMethods: string[];
    createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult>;
    createCheckoutSession(request: CreateCheckoutSessionRequest): Promise<CreateCheckoutSessionResult>;
    verifyWebhookSignature(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): boolean;
    parseWebhookEvent(rawBody: Buffer, headers: Record<string, string | string[] | undefined>): ProviderWebhookEvent;
    getTransactionStatus(providerReference: string): Promise<PaymentProviderTransactionStatus>;
    cancelSubscription(providerSubscriptionReference: string): Promise<void>;
    refundPayment(providerReference: string, amountMinor?: number): Promise<void>;
    createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;
    createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;
    validateWebhookSignature(rawBody: Buffer, signature: string): boolean;
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
export interface CreateCheckoutSessionRequest {
    userId: string;
    email: string;
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
    sessionId: string;
    checkoutUrl?: string;
    clientToken?: string;
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
export declare enum PaymentEventType {
    PAYMENT_SUCCEEDED = "PAYMENT_SUCCEEDED",
    PAYMENT_FAILED = "PAYMENT_FAILED",
    SUBSCRIPTION_CREATED = "SUBSCRIPTION_CREATED",
    SUBSCRIPTION_UPDATED = "SUBSCRIPTION_UPDATED",
    SUBSCRIPTION_CANCELLED = "SUBSCRIPTION_CANCELLED",
    SUBSCRIPTION_RENEWED = "SUBSCRIPTION_RENEWED",
    REFUND_ISSUED = "REFUND_ISSUED",
    UNKNOWN = "UNKNOWN"
}
