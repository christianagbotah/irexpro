import { BasePaymentProvider } from './base-provider';
export declare class WisePayoutProvider extends BasePaymentProvider {
    readonly providerId = "wise";
    readonly displayName = "Wise (Payouts)";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
    readonly supportedPaymentMethods: string[];
}
