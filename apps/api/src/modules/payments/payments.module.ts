import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManualPaymentProvider } from './providers/manual.provider';
import { StripePaymentProvider } from './providers/stripe.provider';
import { PaystackPaymentProvider } from './providers/paystack.provider';
import { FlutterwavePaymentProvider } from './providers/flutterwave.provider';
import { HubtelPaymentProvider } from './providers/hubtel.provider';
import { PayPalBraintreePaymentProvider } from './providers/paypal.provider';
import { WisePayoutProvider } from './providers/wise.provider';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';
import { PaymentRoutingService } from './services/payment-routing.service';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { PaymentsController } from './payments.controller';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Invoice } from './entities/invoice.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { CountryConfig } from '../global-config/entities/country-config.entity';
import { AuditModule } from '../audit/audit.module';
import { PerformanceFeeAssessment } from '../performance-fees/entities/performance-fee-assessment.entity';
import { PerformanceFeeLedgerEntry } from '../performance-fees/entities/performance-fee-ledger-entry.entity';
import { TradingAccountPerformance } from '../performance-fees/entities/trading-account-performance.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentTransaction,
      Invoice,
      PaymentWebhookEvent,
      CountryConfig,
      PerformanceFeeAssessment,
      PerformanceFeeLedgerEntry,
      TradingAccountPerformance,
    ]),
    AuditModule,
  ],
  controllers: [PaymentsController],
  providers: [
    PaymentProviderRegistry,
    ManualPaymentProvider,
    StripePaymentProvider,
    PaystackPaymentProvider,
    FlutterwavePaymentProvider,
    HubtelPaymentProvider,
    PayPalBraintreePaymentProvider,
    WisePayoutProvider,
    PaymentRoutingService,
    WebhookProcessorService,
  ],
  exports: [
    PaymentProviderRegistry,
    PaymentRoutingService,
    WebhookProcessorService,
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
