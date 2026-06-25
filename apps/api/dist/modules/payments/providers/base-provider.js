"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BasePaymentProvider = void 0;
const common_1 = require("@nestjs/common");
const payment_provider_interface_1 = require("../interfaces/payment-provider.interface");
class BasePaymentProvider {
    constructor() {
        this.isLive = false;
    }
    async createCustomer(_params) {
        throw new common_1.NotImplementedException(`${this.displayName}: createCustomer is not yet implemented`);
    }
    async createSubscription(_params) {
        throw new common_1.NotImplementedException(`${this.displayName}: createSubscription is not yet implemented`);
    }
    async cancelSubscription(_providerSubscriptionId) {
        throw new common_1.NotImplementedException(`${this.displayName}: cancelSubscription is not yet implemented`);
    }
    async createPaymentIntent(_params) {
        throw new common_1.NotImplementedException(`${this.displayName}: createPaymentIntent is not yet implemented`);
    }
    validateWebhookSignature(_rawBody, _signature) {
        throw new common_1.NotImplementedException(`${this.displayName}: validateWebhookSignature is not yet implemented`);
    }
    parseWebhookEvent(_rawBody) {
        return { eventType: payment_provider_interface_1.PaymentEventType.UNKNOWN, providerEventId: 'placeholder' };
    }
}
exports.BasePaymentProvider = BasePaymentProvider;
//# sourceMappingURL=base-provider.js.map