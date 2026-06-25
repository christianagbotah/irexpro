"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RiskRejectionCode = void 0;
var RiskRejectionCode;
(function (RiskRejectionCode) {
    RiskRejectionCode["KILL_SWITCH_ACTIVE"] = "KILL_SWITCH_ACTIVE";
    RiskRejectionCode["SESSION_NOT_ACTIVE"] = "SESSION_NOT_ACTIVE";
    RiskRejectionCode["BROKER_DISCONNECTED"] = "BROKER_DISCONNECTED";
    RiskRejectionCode["DAILY_LOSS_LIMIT_REACHED"] = "DAILY_LOSS_LIMIT_REACHED";
    RiskRejectionCode["MAX_DRAWDOWN_REACHED"] = "MAX_DRAWDOWN_REACHED";
    RiskRejectionCode["INSUFFICIENT_MARGIN"] = "INSUFFICIENT_MARGIN";
    RiskRejectionCode["MAX_CONCURRENT_TRADES"] = "MAX_CONCURRENT_TRADES";
    RiskRejectionCode["MAX_DAILY_TRADES"] = "MAX_DAILY_TRADES";
    RiskRejectionCode["POSITION_SIZE_EXCEEDED"] = "POSITION_SIZE_EXCEEDED";
    RiskRejectionCode["MISSING_STOP_LOSS"] = "MISSING_STOP_LOSS";
    RiskRejectionCode["MISSING_TAKE_PROFIT"] = "MISSING_TAKE_PROFIT";
    RiskRejectionCode["INVALID_SL_DISTANCE"] = "INVALID_SL_DISTANCE";
    RiskRejectionCode["INVALID_TP_DIRECTION"] = "INVALID_TP_DIRECTION";
    RiskRejectionCode["LEVERAGE_EXCEEDED"] = "LEVERAGE_EXCEEDED";
    RiskRejectionCode["INSTRUMENT_NOT_ALLOWED"] = "INSTRUMENT_NOT_ALLOWED";
    RiskRejectionCode["HIGH_VOLATILITY"] = "HIGH_VOLATILITY";
    RiskRejectionCode["LOW_LIQUIDITY_REGIME"] = "LOW_LIQUIDITY_REGIME";
    RiskRejectionCode["DUPLICATE_SIGNAL"] = "DUPLICATE_SIGNAL";
    RiskRejectionCode["RISK_ENGINE_ERROR"] = "RISK_ENGINE_ERROR";
})(RiskRejectionCode || (exports.RiskRejectionCode = RiskRejectionCode = {}));
//# sourceMappingURL=risk.interface.js.map