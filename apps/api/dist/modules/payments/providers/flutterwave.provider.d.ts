import { BasePaymentProvider } from './base-provider';
export declare class FlutterwavePaymentProvider extends BasePaymentProvider {
    readonly providerId = "flutterwave";
    readonly displayName = "Flutterwave";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
}
