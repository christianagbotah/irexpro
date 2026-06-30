import { ISmsProvider } from '../interfaces/sms-provider.interface';
export declare class SmsProviderRegistry {
    private readonly logger;
    private readonly providers;
    register(provider: ISmsProvider): void;
    getProvider(providerId: string): ISmsProvider;
    selectProvider(countryCode: string, preferredProviderId?: string): ISmsProvider;
}
