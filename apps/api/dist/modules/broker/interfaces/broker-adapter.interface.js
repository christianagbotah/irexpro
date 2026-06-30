"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerConnectionStatus = exports.BrokerMode = void 0;
var BrokerMode;
(function (BrokerMode) {
    BrokerMode["DEMO"] = "DEMO";
    BrokerMode["LIVE"] = "LIVE";
})(BrokerMode || (exports.BrokerMode = BrokerMode = {}));
var BrokerConnectionStatus;
(function (BrokerConnectionStatus) {
    BrokerConnectionStatus["CONNECTING"] = "CONNECTING";
    BrokerConnectionStatus["CONNECTED"] = "CONNECTED";
    BrokerConnectionStatus["DISCONNECTED"] = "DISCONNECTED";
    BrokerConnectionStatus["ERROR"] = "ERROR";
    BrokerConnectionStatus["SUSPENDED"] = "SUSPENDED";
})(BrokerConnectionStatus || (exports.BrokerConnectionStatus = BrokerConnectionStatus = {}));
//# sourceMappingURL=broker-adapter.interface.js.map