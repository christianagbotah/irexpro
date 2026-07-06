"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentsModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const manual_provider_1 = require("./providers/manual.provider");
const stripe_provider_1 = require("./providers/stripe.provider");
const stripe_http_client_1 = require("./providers/stripe-http.client");
const paystack_provider_1 = require("./providers/paystack.provider");
const paystack_http_client_1 = require("./providers/paystack-http.client");
const flutterwave_provider_1 = require("./providers/flutterwave.provider");
const hubtel_provider_1 = require("./providers/hubtel.provider");
const paypal_provider_1 = require("./providers/paypal.provider");
const wise_provider_1 = require("./providers/wise.provider");
const payment_provider_registry_1 = require("./registry/payment-provider.registry");
const payment_routing_service_1 = require("./services/payment-routing.service");
const webhook_processor_service_1 = require("./services/webhook-processor.service");
const performance_fee_payment_service_1 = require("./services/performance-fee-payment.service");
const payments_controller_1 = require("./payments.controller");
const performance_fee_payment_controller_1 = require("./performance-fee-payment.controller");
const payment_transaction_entity_1 = require("./entities/payment-transaction.entity");
const invoice_entity_1 = require("./entities/invoice.entity");
const payment_webhook_event_entity_1 = require("./entities/payment-webhook-event.entity");
const country_config_entity_1 = require("../global-config/entities/country-config.entity");
const audit_module_1 = require("../audit/audit.module");
const performance_fee_assessment_entity_1 = require("../performance-fees/entities/performance-fee-assessment.entity");
const performance_fee_ledger_entry_entity_1 = require("../performance-fees/entities/performance-fee-ledger-entry.entity");
const trading_account_performance_entity_1 = require("../performance-fees/entities/trading-account-performance.entity");
const user_entity_1 = require("../users/entities/user.entity");
const subscriptions_module_1 = require("../subscriptions/subscriptions.module");
let PaymentsModule = class PaymentsModule {
    constructor(registry, manual, stripe, paystack, flutterwave, hubtel, paypal, wise) {
        this.registry = registry;
        this.manual = manual;
        this.stripe = stripe;
        this.paystack = paystack;
        this.flutterwave = flutterwave;
        this.hubtel = hubtel;
        this.paypal = paypal;
        this.wise = wise;
    }
    onModuleInit() {
        this.registry.register(this.manual);
        this.registry.register(this.stripe);
        this.registry.register(this.paystack);
        this.registry.register(this.flutterwave);
        this.registry.register(this.hubtel);
        this.registry.register(this.paypal);
        this.registry.register(this.wise);
    }
};
exports.PaymentsModule = PaymentsModule;
exports.PaymentsModule = PaymentsModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                payment_transaction_entity_1.PaymentTransaction,
                invoice_entity_1.Invoice,
                payment_webhook_event_entity_1.PaymentWebhookEvent,
                country_config_entity_1.CountryConfig,
                performance_fee_assessment_entity_1.PerformanceFeeAssessment,
                performance_fee_ledger_entry_entity_1.PerformanceFeeLedgerEntry,
                trading_account_performance_entity_1.TradingAccountPerformance,
                user_entity_1.User,
            ]),
            config_1.ConfigModule,
            audit_module_1.AuditModule,
            (0, common_1.forwardRef)(() => subscriptions_module_1.SubscriptionsModule),
        ],
        controllers: [payments_controller_1.PaymentsController, performance_fee_payment_controller_1.PerformanceFeePaymentController],
        providers: [
            payment_provider_registry_1.PaymentProviderRegistry,
            manual_provider_1.ManualPaymentProvider,
            stripe_http_client_1.StripeHttpClient,
            stripe_provider_1.StripePaymentProvider,
            paystack_http_client_1.PaystackHttpClient,
            paystack_provider_1.PaystackPaymentProvider,
            flutterwave_provider_1.FlutterwavePaymentProvider,
            hubtel_provider_1.HubtelPaymentProvider,
            paypal_provider_1.PayPalBraintreePaymentProvider,
            wise_provider_1.WisePayoutProvider,
            payment_routing_service_1.PaymentRoutingService,
            webhook_processor_service_1.WebhookProcessorService,
            performance_fee_payment_service_1.PerformanceFeePaymentService,
        ],
        exports: [
            payment_provider_registry_1.PaymentProviderRegistry,
            payment_routing_service_1.PaymentRoutingService,
            webhook_processor_service_1.WebhookProcessorService,
            performance_fee_payment_service_1.PerformanceFeePaymentService,
            manual_provider_1.ManualPaymentProvider,
            stripe_provider_1.StripePaymentProvider,
            paystack_provider_1.PaystackPaymentProvider,
            flutterwave_provider_1.FlutterwavePaymentProvider,
            hubtel_provider_1.HubtelPaymentProvider,
            paypal_provider_1.PayPalBraintreePaymentProvider,
            wise_provider_1.WisePayoutProvider,
        ],
    }),
    __metadata("design:paramtypes", [payment_provider_registry_1.PaymentProviderRegistry,
        manual_provider_1.ManualPaymentProvider,
        stripe_provider_1.StripePaymentProvider,
        paystack_provider_1.PaystackPaymentProvider,
        flutterwave_provider_1.FlutterwavePaymentProvider,
        hubtel_provider_1.HubtelPaymentProvider,
        paypal_provider_1.PayPalBraintreePaymentProvider,
        wise_provider_1.WisePayoutProvider])
], PaymentsModule);
//# sourceMappingURL=payments.module.js.map