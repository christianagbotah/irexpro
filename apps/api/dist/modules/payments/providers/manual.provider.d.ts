import { CreateCheckoutSessionRequest, CreateCheckoutSessionResult, CreateCustomerParams, CreatePaymentIntentParams, CreateSubscriptionParams, IPaymentProvider, PaymentProviderTransactionStatus, ProviderCustomerResult, ProviderPaymentIntentResult, ProviderSubscriptionResult, ProviderWebhookEvent } from '../interfaces/payment-provider.interface';
export declare class ManualPaymentProvider implements IPaymentProvider {
    private readonly logger;
    readonly providerId = "manual";
    readonly displayName = "Manual (DEV/TEST ONLY)";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
    readonly supportedPaymentMethods: string[];
    createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult>;
    createCheckoutSession(request: CreateCheckoutSessionRequest): Promise<CreateCheckoutSessionResult>;
    verifyWebhookSignature(_rawBody: Buffer, _headers: Record<string, string | string[] | undefined>): boolean;
    parseWebhookEvent(_rawBody: Buffer, _headers: Record<string, string | string[] | undefined>): ProviderWebhookEvent;
    getTransactionStatus(providerReference: string): Promise<PaymentProviderTransactionStatus>;
    cancelSubscription(providerSubscriptionId: string): Promise<void>;
    refundPayment(providerReference: string, _amountMinor?: number): Promise<void>;
    createSubscription(_params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;
    createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;
    validateWebhookSignature(_rawBody: Buffer, _signature: string): boolean;
}
