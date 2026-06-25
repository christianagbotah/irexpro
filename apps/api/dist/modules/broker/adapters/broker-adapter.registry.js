"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var BrokerAdapterRegistry_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerAdapterRegistry = void 0;
const common_1 = require("@nestjs/common");
let BrokerAdapterRegistry = BrokerAdapterRegistry_1 = class BrokerAdapterRegistry {
    constructor() {
        this.logger = new common_1.Logger(BrokerAdapterRegistry_1.name);
        this.adapters = new Map();
    }
    register(adapter) {
        this.adapters.set(adapter.brokerId, adapter);
        this.logger.log(`Registered broker adapter: ${adapter.brokerId} (${adapter.brokerName})`);
    }
    getAdapter(brokerId) {
        const adapter = this.adapters.get(brokerId);
        if (!adapter) {
            throw new common_1.NotFoundException(`No broker adapter registered for brokerId: "${brokerId}". ` +
                `Supported brokers: [${this.getSupportedBrokerIds().join(', ')}]`);
        }
        return adapter;
    }
    getSupportedBrokers() {
        return Array.from(this.adapters.values()).map((a) => ({
            brokerId: a.brokerId,
            brokerName: a.brokerName,
            supportsDemo: a.supportsDemo,
        }));
    }
    getSupportedBrokerIds() {
        return Array.from(this.adapters.keys());
    }
    isSupported(brokerId) {
        return this.adapters.has(brokerId);
    }
};
exports.BrokerAdapterRegistry = BrokerAdapterRegistry;
exports.BrokerAdapterRegistry = BrokerAdapterRegistry = BrokerAdapterRegistry_1 = __decorate([
    (0, common_1.Injectable)()
], BrokerAdapterRegistry);
//# sourceMappingURL=broker-adapter.registry.js.map