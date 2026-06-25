import { BasePaymentProvider } from './base-provider';
export declare class PaystackPaymentProvider extends BasePaymentProvider {
    readonly providerId = "paystack";
    readonly displayName = "Paystack";
    readonly supportedCountries: string[];
    readonly supportedCurrencies: string[];
    readonly isLive = false;
}
