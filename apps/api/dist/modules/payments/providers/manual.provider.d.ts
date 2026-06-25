import { CreateCustomerParams, CreatePaymentIntentParams, CreateSubscriptionParams, IPaymentProvider, ProviderCustomerResult, ProviderPaymentIntentResult, ProviderSubscriptionResult, ProviderWebhookEvent } from '../interfaces/payment-provider.interface';
export declare class ManualPaymentProvider implements IPaymentProvider {
    private readonly logger;
    readonly providerId = "manual";
    readonly displayName = "Manual (DEV/TEST ONLY)";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
    createCustomer(params: CreateCustomerParams): Promise<ProviderCustomerResult>;
    createSubscription(params: CreateSubscriptionParams): Promise<ProviderSubscriptionResult>;
    cancelSubscription(providerSubscriptionId: string): Promise<void>;
    createPaymentIntent(params: CreatePaymentIntentParams): Promise<ProviderPaymentIntentResult>;
    validateWebhookSignature(_rawBody: Buffer, _signature: string): boolean;
    parseWebhookEvent(_rawBody: Buffer): ProviderWebhookEvent;
}
