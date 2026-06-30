"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeEvent = void 0;
var RealtimeEvent;
(function (RealtimeEvent) {
    RealtimeEvent["TRADING_SESSION_STARTED"] = "trading.session.started";
    RealtimeEvent["TRADING_SESSION_STOPPED"] = "trading.session.stopped";
    RealtimeEvent["TRADE_PENDING"] = "trade.pending";
    RealtimeEvent["TRADE_OPENED"] = "trade.opened";
    RealtimeEvent["TRADE_REJECTED"] = "trade.rejected";
    RealtimeEvent["TRADE_CLOSED"] = "trade.closed";
    RealtimeEvent["TRADE_RECONCILIATION_PENDING"] = "trade.reconciliation_pending";
    RealtimeEvent["RISK_SIGNAL_APPROVED"] = "risk.signal.approved";
    RealtimeEvent["RISK_SIGNAL_REJECTED"] = "risk.signal.rejected";
    RealtimeEvent["BROKER_CONNECTION_STATUS_CHANGED"] = "broker.connection.status_changed";
    RealtimeEvent["SUBSCRIPTION_STATUS_CHANGED"] = "subscription.status_changed";
    RealtimeEvent["AI_SIGNAL_RECEIVED"] = "ai.signal.received";
    RealtimeEvent["AI_SIGNAL_IGNORED"] = "ai.signal.ignored";
    RealtimeEvent["SYSTEM_NOTIFICATION"] = "system.notification";
    RealtimeEvent["CONNECTION_ESTABLISHED"] = "connection.established";
})(RealtimeEvent || (exports.RealtimeEvent = RealtimeEvent = {}));
//# sourceMappingURL=realtime-event.enum.js.map