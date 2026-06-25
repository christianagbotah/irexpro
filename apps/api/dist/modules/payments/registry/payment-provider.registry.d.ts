import { IPaymentProvider } from '../interfaces/payment-provider.interface';
export declare class PaymentProviderRegistry {
    private readonly logger;
    private readonly providers;
    register(provider: IPaymentProvider): void;
    getProvider(providerId: string): IPaymentProvider;
    getAvailableProviders(): IPaymentProvider[];
    selectProvider(countryCode: string, currency: string, preferredProviderId?: string): IPaymentProvider;
}
