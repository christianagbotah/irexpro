import { Module, OnModuleInit } from '@nestjs/common';
import { ManualPaymentProvider } from './providers/manual.provider';
import { StripePaymentProvider } from './providers/stripe.provider';
import { PaystackPaymentProvider } from './providers/paystack.provider';
import { FlutterwavePaymentProvider } from './providers/flutterwave.provider';
import { HubtelPaymentProvider } from './providers/hubtel.provider';
import { PayPalBraintreePaymentProvider } from './providers/paypal.provider';
import { WisePayoutProvider } from './providers/wise.provider';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';

@Module({
  providers: [
    PaymentProviderRegistry,
    ManualPaymentProvider,
    StripePaymentProvider,
    PaystackPaymentProvider,
    FlutterwavePaymentProvider,
    HubtelPaymentProvider,
    PayPalBraintreePaymentProvider,
    WisePayoutProvider,
  ],
  exports: [
    PaymentProviderRegistry,
    ManualPaymentProvider,
    StripePaymentProvider,
    PaystackPaymentProvider,
    FlutterwavePaymentProvider,
    HubtelPaymentProvider,
    PayPalBraintreePaymentProvider,
    WisePayoutProvider,
  ],
})
export class PaymentsModule implements OnModuleInit {
  constructor(
    private registry: PaymentProviderRegistry,
    private manual: ManualPaymentProvider,
    private stripe: StripePaymentProvider,
    private paystack: PaystackPaymentProvider,
    private flutterwave: FlutterwavePaymentProvider,
    private hubtel: HubtelPaymentProvider,
    private paypal: PayPalBraintreePaymentProvider,
    private wise: WisePayoutProvider,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.manual);
    this.registry.register(this.stripe);
    this.registry.register(this.paystack);
    this.registry.register(this.flutterwave);
    this.registry.register(this.hubtel);
    this.registry.register(this.paypal);
    this.registry.register(this.wise);
  }
}
