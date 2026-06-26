import { BasePaymentProvider } from './base-provider';
export declare class HubtelPaymentProvider extends BasePaymentProvider {
    readonly providerId = "hubtel";
    readonly displayName = "Hubtel";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
    readonly supportedPaymentMethods: string[];
}
