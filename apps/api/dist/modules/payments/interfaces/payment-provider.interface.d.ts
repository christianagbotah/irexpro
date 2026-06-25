export interface IPaymentProvider {
    readonly providerId: string;
    readonly displayName: string;
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive: boolean;
    createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult>;
    createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;
    cancelSubscription(providerSubscriptionId: string): Promise<void>;
    createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;
    validateWebhookSignature(rawBody: Buffer, signature: string): boolean;
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
