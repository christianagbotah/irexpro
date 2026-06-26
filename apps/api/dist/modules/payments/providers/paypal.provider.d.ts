import { BasePaymentProvider } from './base-provider';
export declare class PayPalBraintreePaymentProvider extends BasePaymentProvider {
    readonly providerId = "paypal";
    readonly displayName = "PayPal / Braintree";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
    readonly supportedPaymentMethods: string[];
}
