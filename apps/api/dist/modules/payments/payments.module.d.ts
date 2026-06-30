import { OnModuleInit } from '@nestjs/common';
import { ManualPaymentProvider } from './providers/manual.provider';
import { StripePaymentProvider } from './providers/stripe.provider';
import { PaystackPaymentProvider } from './providers/paystack.provider';
import { FlutterwavePaymentProvider } from './providers/flutterwave.provider';
import { HubtelPaymentProvider } from './providers/hubtel.provider';
import { PayPalBraintreePaymentProvider } from './providers/paypal.provider';
import { WisePayoutProvider } from './providers/wise.provider';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';
export declare class PaymentsModule implements OnModuleInit {
    private registry;
    private manual;
    private stripe;
    private paystack;
    private flutterwave;
    private hubtel;
    private paypal;
    private wise;
    constructor(registry: PaymentProviderRegistry, manual: ManualPaymentProvider, stripe: StripePaymentProvider, paystack: PaystackPaymentProvider, flutterwave: FlutterwavePaymentProvider, hubtel: HubtelPaymentProvider, paypal: PayPalBraintreePaymentProvider, wise: WisePayoutProvider);
    onModuleInit(): void;
}
