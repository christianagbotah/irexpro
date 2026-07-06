import { CreateCheckoutSessionRequest, CreateCheckoutSessionResult, CreateCustomerParams, CreatePaymentIntentParams, CreateSubscriptionParams, IPaymentProvider, PaymentProviderTransactionStatus, ProviderCustomerResult, ProviderPaymentIntentResult, ProviderSubscriptionResult, ProviderWebhookEvent } from '../interfaces/payment-provider.interface';
export declare abstract class BasePaymentProvider implements IPaymentProvider {
    abstract readonly providerId: string;
    abstract readonly displayName: string;
    abstract readonly supportedCountries: string[];
    abstract readonly supportedCurrencies: string[];
    readonly isLive: boolean;
    readonly supportedPaymentMethods: string[];
    createCustomer(_params: CreateCustomerParams): Promise<ProviderCustomerResult>;
    createCheckoutSession(_request: CreateCheckoutSessionRequest): Promise<CreateCheckoutSessionResult>;
    verifyWebhookSignature(_rawBody: Buffer, _headers: Record<string, string | string[] | undefined>): boolean;
    parseWebhookEvent(_rawBody: Buffer, _headers: Record<string, string | string[] | undefined>): ProviderWebhookEvent;
    getTransactionStatus(_providerReference: string): Promise<PaymentProviderTransactionStatus>;
    cancelSubscription(_providerSubscriptionReference: string): Promise<void>;
    refundPayment(_providerReference: string, _amountMinor?: number): Promise<void>;
    createSubscription(_params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;
    createPaymentIntent(_params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;
    validateWebhookSignature(_rawBody: Buffer, _signature: string): boolean;
}
