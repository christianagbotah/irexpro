"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var ManualPaymentProvider_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManualPaymentProvider = void 0;
const common_1 = require("@nestjs/common");
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
const uuid_1 = require("uuid");
let ManualPaymentProvider = ManualPaymentProvider_1 = class ManualPaymentProvider {
    constructor() {
        this.logger = new common_1.Logger(ManualPaymentProvider_1.name);
        this.providerId = 'manual';
        this.displayName = 'Manual (DEV/TEST ONLY)';
        this.supportedCountries = ['*'];
        this.supportedCurrencies = ['*'];
        this.isLive = false;
    }
    async createCustomer(params) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createCustomer called for user ${params.userId}`);
        return {
            providerCustomerId: `manual_cust_${(0, uuid_1.v4)()}`,
            provider: this.providerId,
        };
    }
    async createSubscription(params) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createSubscription called`);
        const now = new Date();
        const end = new Date(now);
        end.setMonth(end.getMonth() + 1);
        return {
            providerSubscriptionId: `manual_sub_${(0, uuid_1.v4)()}`,
            status: 'active',
            currentPeriodStart: now,
            currentPeriodEnd: end,
        };
    }
    async cancelSubscription(providerSubscriptionId) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.cancelSubscription: ${providerSubscriptionId}`);
    }
    async createPaymentIntent(params) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createPaymentIntent: ${params.amountCents} ${params.currency}`);
        return {
            providerPaymentIntentId: `manual_pi_${(0, uuid_1.v4)()}`,
            status: 'succeeded',
        };
    }
    validateWebhookSignature(_rawBody, _signature) {
        this.logger.warn('[DEV/TEST] ManualPaymentProvider.validateWebhookSignature — always true in dev');
        return true;
    }
    parseWebhookEvent(_rawBody) {
        return {
            eventType: payment_provider_interface_1.PaymentEventType.PAYMENT_SUCCEEDED,
            providerEventId: `manual_evt_${(0, uuid_1.v4)()}`,
        };
    }
};
exports.ManualPaymentProvider = ManualPaymentProvider;
exports.ManualPaymentProvider = ManualPaymentProvider = ManualPaymentProvider_1 = __decorate([
    (0, common_1.Injectable)()
], ManualPaymentProvider);
//# sourceMappingURL=manual.provider.js.map