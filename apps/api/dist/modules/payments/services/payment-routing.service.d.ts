import { Repository } from 'typeorm';
import { CountryConfig } from '../../global-config/entities/country-config.entity';
import { IPaymentProvider } from '../interfaces/payment-provider.interface';
import { PaymentProviderRegistry } from '../registry/payment-provider.registry';
export interface AvailableProviderDto {
    providerId: string;
    displayName: string;
    supportedCurrencies: string[];
    supportedCountries: string[];
    supportedPaymentMethods: string[];
    isLive: boolean;
    isSandbox: boolean;
}
export interface RouteProviderResult {
    provider: IPaymentProvider;
    reason: string;
}
export declare class PaymentRoutingService {
    private readonly registry;
    private readonly countryConfigRepo;
    private readonly logger;
    constructor(registry: PaymentProviderRegistry, countryConfigRepo: Repository<CountryConfig>);
    getAvailableProviders(countryCode: string, currency: string): Promise<AvailableProviderDto[]>;
    getAllPublicProviders(): AvailableProviderDto[];
    routeForCheckout(countryCode: string, currency: string, preferredProviderId?: string): Promise<RouteProviderResult>;
    private tryGetProvider;
    private providerSupportsCurrency;
    private providerSupportsCountry;
}
