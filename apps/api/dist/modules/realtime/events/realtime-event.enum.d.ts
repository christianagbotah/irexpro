export declare enum RealtimeEvent {
    TRADING_SESSION_STARTED = "trading.session.started",
    TRADING_SESSION_STOPPED = "trading.session.stopped",
    TRADE_PENDING = "trade.pending",
    TRADE_OPENED = "trade.opened",
    TRADE_REJECTED = "trade.rejected",
    TRADE_CLOSED = "trade.closed",
    TRADE_RECONCILIATION_PENDING = "trade.reconciliation_pending",
    RISK_SIGNAL_APPROVED = "risk.signal.approved",
    RISK_SIGNAL_REJECTED = "risk.signal.rejected",
    BROKER_CONNECTION_STATUS_CHANGED = "broker.connection.status_changed",
    SUBSCRIPTION_STATUS_CHANGED = "subscription.status_changed",
    AI_SIGNAL_RECEIVED = "ai.signal.received",
    AI_SIGNAL_IGNORED = "ai.signal.ignored",
    SYSTEM_NOTIFICATION = "system.notification",
    CONNECTION_ESTABLISHED = "connection.established"
}
