"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainEventType = void 0;
var DomainEventType;
(function (DomainEventType) {
    DomainEventType["TRADING_SESSION_STARTED"] = "trading.session.started";
    DomainEventType["TRADING_SESSION_STOPPED"] = "trading.session.stopped";
    DomainEventType["TRADE_PENDING"] = "trade.pending";
    DomainEventType["TRADE_OPENED"] = "trade.opened";
    DomainEventType["TRADE_REJECTED"] = "trade.rejected";
    DomainEventType["TRADE_CLOSED"] = "trade.closed";
    DomainEventType["TRADE_RECONCILIATION_PENDING"] = "trade.reconciliation_pending";
    DomainEventType["RISK_SIGNAL_APPROVED"] = "risk.signal.approved";
    DomainEventType["RISK_SIGNAL_REJECTED"] = "risk.signal.rejected";
    DomainEventType["BROKER_STATUS_CHANGED"] = "broker.connection.status_changed";
    DomainEventType["SUBSCRIPTION_STATUS_CHANGED"] = "subscription.status_changed";
    DomainEventType["AI_SIGNAL_RECEIVED"] = "ai.signal.received";
    DomainEventType["AI_SIGNAL_IGNORED"] = "ai.signal.ignored";
    DomainEventType["SYSTEM_NOTIFICATION"] = "system.notification";
})(DomainEventType || (exports.DomainEventType = DomainEventType = {}));
//# sourceMappingURL=domain-event-type.enum.js.map