import { BasePaymentProvider } from './base-provider';
export declare class StripePaymentProvider extends BasePaymentProvider {
    readonly providerId = "stripe";
    readonly displayName = "Stripe";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
}
