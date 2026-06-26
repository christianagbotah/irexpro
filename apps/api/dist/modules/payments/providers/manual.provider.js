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
        this.supportedPaymentMethods = ['manual'];
    }
    async createCustomer(params) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createCustomer called for user ${params.userId}`);
        return {
            providerCustomerId: `manual_cust_${(0, uuid_1.v4)()}`,
            provider: this.providerId,
        };
    }
    async createCheckoutSession(request) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.createCheckoutSession for user ${request.userId}`);
        const sessionId = `manual_session_${(0, uuid_1.v4)()}`;
        return {
            sessionId,
            checkoutUrl: undefined,
            providerTransactionReference: sessionId,
            provider: this.providerId,
        };
    }
    verifyWebhookSignature(_rawBody, _headers) {
        this.logger.warn('[DEV/TEST] ManualPaymentProvider.verifyWebhookSignature — always true in dev');
        return true;
    }
    parseWebhookEvent(_rawBody, _headers) {
        return {
            eventType: payment_provider_interface_1.PaymentEventType.PAYMENT_SUCCEEDED,
            providerEventId: `manual_evt_${(0, uuid_1.v4)()}`,
        };
    }
    async getTransactionStatus(providerReference) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.getTransactionStatus: ${providerReference}`);
        return {
            providerReference,
            status: 'SUCCEEDED',
            paidAt: new Date(),
        };
    }
    async cancelSubscription(providerSubscriptionId) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.cancelSubscription: ${providerSubscriptionId}`);
    }
    async refundPayment(providerReference, _amountMinor) {
        this.logger.warn(`[DEV/TEST] ManualPaymentProvider.refundPayment: ${providerReference}`);
    }
    async createSubscription(_params) {
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
};
exports.ManualPaymentProvider = ManualPaymentProvider;
exports.ManualPaymentProvider = ManualPaymentProvider = ManualPaymentProvider_1 = __decorate([
    (0, common_1.Injectable)()
], ManualPaymentProvider);
//# sourceMappingURL=manual.provider.js.map