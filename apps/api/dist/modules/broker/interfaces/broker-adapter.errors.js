"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RETRYABLE_BROKER_ERRORS = exports.BrokerErrorCode = exports.BrokerAdapterError = void 0;
class BrokerAdapterError extends Error {
    constructor(code, message, brokerMessage, isRetryable = false) {
        super(message);
        this.code = code;
        this.brokerMessage = brokerMessage;
        this.isRetryable = isRetryable;
        this.name = 'BrokerAdapterError';
    }
}
exports.BrokerAdapterError = BrokerAdapterError;
var BrokerErrorCode;
(function (BrokerErrorCode) {
    BrokerErrorCode["AUTHENTICATION_FAILED"] = "AUTHENTICATION_FAILED";
    BrokerErrorCode["INSUFFICIENT_MARGIN"] = "INSUFFICIENT_MARGIN";
    BrokerErrorCode["INVALID_INSTRUMENT"] = "INVALID_INSTRUMENT";
    BrokerErrorCode["INVALID_LOT_SIZE"] = "INVALID_LOT_SIZE";
    BrokerErrorCode["DUPLICATE_ORDER"] = "DUPLICATE_ORDER";
    BrokerErrorCode["MARKET_CLOSED"] = "MARKET_CLOSED";
    BrokerErrorCode["POSITION_NOT_FOUND"] = "POSITION_NOT_FOUND";
    BrokerErrorCode["CONNECTION_TIMEOUT"] = "CONNECTION_TIMEOUT";
    BrokerErrorCode["CONNECTION_LOST"] = "CONNECTION_LOST";
    BrokerErrorCode["RATE_LIMITED"] = "RATE_LIMITED";
    BrokerErrorCode["BROKER_SERVER_ERROR"] = "BROKER_SERVER_ERROR";
    BrokerErrorCode["DECRYPTION_FAILED"] = "DECRYPTION_FAILED";
    BrokerErrorCode["NOT_CONNECTED"] = "NOT_CONNECTED";
    BrokerErrorCode["UNKNOWN"] = "UNKNOWN";
})(BrokerErrorCode || (exports.BrokerErrorCode = BrokerErrorCode = {}));
exports.RETRYABLE_BROKER_ERRORS = new Set([
    BrokerErrorCode.CONNECTION_TIMEOUT,
    BrokerErrorCode.RATE_LIMITED,
    BrokerErrorCode.BROKER_SERVER_ERROR,
]);
//# sourceMappingURL=broker-adapter.errors.js.map