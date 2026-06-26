"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasePaymentProvider = void 0;
const common_1 = require("@nestjs/common");
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
class BasePaymentProvider {
    constructor() {
        this.isLive = false;
        this.supportedPaymentMethods = ['card'];
    }
    async createCustomer(_params) {
        throw new common_1.NotImplementedException(`${this.displayName}: createCustomer is not yet implemented`);
    }
    async createCheckoutSession(_request) {
        throw new common_1.NotImplementedException(`${this.displayName}: createCheckoutSession is not yet implemented`);
    }
    verifyWebhookSignature(_rawBody, _headers) {
        return false;
    }
    parseWebhookEvent(_rawBody, _headers) {
        return { eventType: payment_provider_interface_1.PaymentEventType.UNKNOWN, providerEventId: 'placeholder' };
    }
    async getTransactionStatus(_providerReference) {
        throw new common_1.NotImplementedException(`${this.displayName}: getTransactionStatus is not yet implemented`);
    }
    async cancelSubscription(_providerSubscriptionReference) {
        throw new common_1.NotImplementedException(`${this.displayName}: cancelSubscription is not yet implemented`);
    }
    async refundPayment(_providerReference, _amountMinor) {
        throw new common_1.NotImplementedException(`${this.displayName}: refundPayment is not yet implemented`);
    }
    async createSubscription(_params) {
        throw new common_1.NotImplementedException(`${this.displayName}: createSubscription is not yet implemented`);
    }
    async createPaymentIntent(_params) {
        throw new common_1.NotImplementedException(`${this.displayName}: createPaymentIntent is not yet implemented`);
    }
    validateWebhookSignature(_rawBody, _signature) {
        return false;
    }
}
exports.BasePaymentProvider = BasePaymentProvider;
//# sourceMappingURL=base-provider.js.map