"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerReconciliationModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const broker_trade_reconciliation_run_entity_1 = require("./entities/broker-trade-reconciliation-run.entity");
const broker_reconciled_trade_entity_1 = require("./entities/broker-reconciled-trade.entity");
const performance_fee_ledger_entry_entity_1 = require("../performance-fees/entities/performance-fee-ledger-entry.entity");
const performance_fee_policy_entity_1 = require("../performance-fees/entities/performance-fee-policy.entity");
const user_subscription_entity_1 = require("../subscriptions/entities/user-subscription.entity");
const broker_module_1 = require("../broker/broker.module");
const audit_module_1 = require("../audit/audit.module");
const broker_trade_reconciliation_service_1 = require("./services/broker-trade-reconciliation.service");
const closed_trade_normalizer_service_1 = require("./services/closed-trade-normalizer.service");
const broker_reconciliation_controller_1 = require("./broker-reconciliation.controller");
let BrokerReconciliationModule = class BrokerReconciliationModule {
};
exports.BrokerReconciliationModule = BrokerReconciliationModule;
exports.BrokerReconciliationModule = BrokerReconciliationModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                broker_trade_reconciliation_run_entity_1.BrokerTradeReconciliationRun,
                broker_reconciled_trade_entity_1.BrokerReconciledTrade,
                performance_fee_ledger_entry_entity_1.PerformanceFeeLedgerEntry,
                performance_fee_policy_entity_1.PerformanceFeePolicy,
                user_subscription_entity_1.UserSubscription,
            ]),
            broker_module_1.BrokerModule,
            audit_module_1.AuditModule,
        ],
        controllers: [broker_reconciliation_controller_1.BrokerReconciliationController],
        providers: [broker_trade_reconciliation_service_1.BrokerTradeReconciliationService, closed_trade_normalizer_service_1.ClosedTradeNormalizerService],
        exports: [broker_trade_reconciliation_service_1.BrokerTradeReconciliationService],
    })
], BrokerReconciliationModule);
//# sourceMappingURL=broker-reconciliation.module.js.map