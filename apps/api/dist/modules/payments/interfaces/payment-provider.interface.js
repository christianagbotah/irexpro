"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentEventType = void 0;
var PaymentEventType;
(function (PaymentEventType) {
    PaymentEventType["PAYMENT_SUCCEEDED"] = "PAYMENT_SUCCEEDED";
    PaymentEventType["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    PaymentEventType["SUBSCRIPTION_CREATED"] = "SUBSCRIPTION_CREATED";
    PaymentEventType["SUBSCRIPTION_UPDATED"] = "SUBSCRIPTION_UPDATED";
    PaymentEventType["SUBSCRIPTION_CANCELLED"] = "SUBSCRIPTION_CANCELLED";
    PaymentEventType["SUBSCRIPTION_RENEWED"] = "SUBSCRIPTION_RENEWED";
    PaymentEventType["REFUND_ISSUED"] = "REFUND_ISSUED";
    PaymentEventType["UNKNOWN"] = "UNKNOWN";
})(PaymentEventType || (exports.PaymentEventType = PaymentEventType = {}));
//# sourceMappingURL=payment-provider.interface.js.map