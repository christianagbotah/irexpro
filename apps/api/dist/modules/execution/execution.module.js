"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const bullmq_1 = require("@nestjs/bullmq");
const execution_service_1 = require("./execution.service");
const trade_entity_1 = require("./entities/trade.entity");
const trading_session_entity_1 = require("./entities/trading-session.entity");
const trade_reconciliation_job_1 = require("./jobs/trade-reconciliation.job");
const trade_reconciliation_producer_1 = require("./jobs/trade-reconciliation.producer");
const risk_module_1 = require("../risk/risk.module");
const broker_module_1 = require("../broker/broker.module");
const audit_module_1 = require("../audit/audit.module");
let ExecutionModule = class ExecutionModule {
};
exports.ExecutionModule = ExecutionModule;
exports.ExecutionModule = ExecutionModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([trade_entity_1.Trade, trading_session_entity_1.TradingSession]),
            bullmq_1.BullModule.registerQueue({ name: trade_reconciliation_job_1.TRADE_RECONCILIATION_QUEUE }),
            (0, common_1.forwardRef)(() => risk_module_1.RiskModule),
            broker_module_1.BrokerModule,
            audit_module_1.AuditModule,
        ],
        providers: [
            execution_service_1.ExecutionService,
            trade_reconciliation_job_1.TradeReconciliationJob,
            trade_reconciliation_producer_1.TradeReconciliationProducer,
        ],
        exports: [execution_service_1.ExecutionService],
    })
], ExecutionModule);
//# sourceMappingURL=execution.module.js.map