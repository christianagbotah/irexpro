export declare class BrokerAdapterError extends Error {
    readonly code: BrokerErrorCode;
    readonly brokerMessage?: string | undefined;
    readonly isRetryable: boolean;
    constructor(code: BrokerErrorCode, message: string, brokerMessage?: string | undefined, isRetryable?: boolean);
}
export declare enum BrokerErrorCode {
    AUTHENTICATION_FAILED = "AUTHENTICATION_FAILED",
    INSUFFICIENT_MARGIN = "INSUFFICIENT_MARGIN",
    INVALID_INSTRUMENT = "INVALID_INSTRUMENT",
    INVALID_LOT_SIZE = "INVALID_LOT_SIZE",
    DUPLICATE_ORDER = "DUPLICATE_ORDER",
    MARKET_CLOSED = "MARKET_CLOSED",
    POSITION_NOT_FOUND = "POSITION_NOT_FOUND",
    CONNECTION_TIMEOUT = "CONNECTION_TIMEOUT",
    CONNECTION_LOST = "CONNECTION_LOST",
    RATE_LIMITED = "RATE_LIMITED",
    BROKER_SERVER_ERROR = "BROKER_SERVER_ERROR",
    DECRYPTION_FAILED = "DECRYPTION_FAILED",
    NOT_CONNECTED = "NOT_CONNECTED",
    UNKNOWN = "UNKNOWN"
}
export declare const RETRYABLE_BROKER_ERRORS: Set<BrokerErrorCode>;
