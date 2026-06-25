import { CreateCustomerParams, CreatePaymentIntentParams, CreateSubscriptionParams, IPaymentProvider, ProviderCustomerResult, ProviderPaymentIntentResult, ProviderSubscriptionResult, ProviderWebhookEvent } from '../interfaces/payment-provider.interface';
export declare abstract class BasePaymentProvider implements IPaymentProvider {
    abstract readonly providerId: string;
    abstract readonly displayName: string;
    abstract readonly supportedCountries: string[];
    abstract readonly supportedCurrencies: string[];
    readonly isLive = false;
    createCustomer(_params: CreateCustomerParams): Promise<ProviderCustomerResult>;
    createSubscription(_params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;
    cancelSubscription(_providerSubscriptionId: string): Promise<void>;
    createPaymentIntent(_params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;
    validateWebhookSignature(_rawBody: Buffer, _signature: string): boolean;
    parseWebhookEvent(_rawBody: Buffer): ProviderWebhookEvent;
}
