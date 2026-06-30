"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyModule = void 0;
const common_1 = require("@nestjs/common");
const strategy_orchestrator_service_1 = require("./strategy-orchestrator.service");
const risk_module_1 = require("../risk/risk.module");
const execution_module_1 = require("../execution/execution.module");
const broker_module_1 = require("../broker/broker.module");
const subscriptions_module_1 = require("../subscriptions/subscriptions.module");
const audit_module_1 = require("../audit/audit.module");
let StrategyModule = class StrategyModule {
};
exports.StrategyModule = StrategyModule;
exports.StrategyModule = StrategyModule = __decorate([
    (0, common_1.Module)({
        imports: [
            risk_module_1.RiskModule,
            (0, common_1.forwardRef)(() => execution_module_1.ExecutionModule),
            broker_module_1.BrokerModule,
            subscriptions_module_1.SubscriptionsModule,
            audit_module_1.AuditModule,
        ],
        providers: [strategy_orchestrator_service_1.StrategyOrchestratorService],
        exports: [strategy_orchestrator_service_1.StrategyOrchestratorService],
    })
], StrategyModule);
//# sourceMappingURL=strategy.module.js.map