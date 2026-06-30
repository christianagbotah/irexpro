"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmsMessageType = void 0;
var SmsMessageType;
(function (SmsMessageType) {
    SmsMessageType["OTP"] = "OTP";
    SmsMessageType["LOGIN_ALERT"] = "LOGIN_ALERT";
    SmsMessageType["PASSWORD_RESET"] = "PASSWORD_RESET";
    SmsMessageType["SUBSCRIPTION_ACTIVATED"] = "SUBSCRIPTION_ACTIVATED";
    SmsMessageType["SUBSCRIPTION_EXPIRING"] = "SUBSCRIPTION_EXPIRING";
    SmsMessageType["PAYMENT_FAILED"] = "PAYMENT_FAILED";
    SmsMessageType["AI_TRADING_STARTED"] = "AI_TRADING_STARTED";
    SmsMessageType["AI_TRADING_STOPPED"] = "AI_TRADING_STOPPED";
    SmsMessageType["BROKER_CONNECTED"] = "BROKER_CONNECTED";
    SmsMessageType["BROKER_DISCONNECTED"] = "BROKER_DISCONNECTED";
    SmsMessageType["RISK_LIMIT_REACHED"] = "RISK_LIMIT_REACHED";
    SmsMessageType["TRADE_OPENED"] = "TRADE_OPENED";
    SmsMessageType["TRADE_CLOSED"] = "TRADE_CLOSED";
})(SmsMessageType || (exports.SmsMessageType = SmsMessageType = {}));
//# sourceMappingURL=sms-provider.interface.js.map