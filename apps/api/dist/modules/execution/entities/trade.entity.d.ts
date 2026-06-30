export declare enum TradeStatus {
    PENDING = "PENDING",
    OPEN = "OPEN",
    CLOSED = "CLOSED",
    REJECTED = "REJECTED",
    CANCELLED = "CANCELLED",
    RECONCILIATION_PENDING = "RECONCILIATION_PENDING"
}
export declare enum TradeDirection {
    BUY = "BUY",
    SELL = "SELL"
}
export declare enum TradeCloseReason {
    STOP_LOSS_HIT = "STOP_LOSS_HIT",
    TAKE_PROFIT_HIT = "TAKE_PROFIT_HIT",
    MANUAL_CLOSE = "MANUAL_CLOSE",
    AI_CLOSE_SIGNAL = "AI_CLOSE_SIGNAL",
    KILL_SWITCH_FORCE_CLOSE = "KILL_SWITCH_FORCE_CLOSE",
    BROKER_CLOSE = "BROKER_CLOSE",
    RECONCILIATION = "RECONCILIATION"
}
export declare class Trade {
    id: string;
    userId: string;
    brokerConnectionId: string;
    signalId: string | null;
    idempotencyKey: string;
    instrument: string;
    direction: TradeDirection;
    lotSize: string;
    requestedEntryPrice: string;
    fillPrice: string | null;
    stopLoss: string;
    takeProfit: string;
    trailingStopPips: string | null;
    externalOrderId: string | null;
    status: TradeStatus;
    exitPrice: string | null;
    realisedPnl: string | null;
    closeReason: TradeCloseReason | null;
    brokerRejectionReason: string | null;
    openedAt: Date | null;
    closedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
