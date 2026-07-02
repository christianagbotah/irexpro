"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceBillingModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const performance_fee_billing_cycle_entity_1 = require("./entities/performance-fee-billing-cycle.entity");
const audit_module_1 = require("../audit/audit.module");
const broker_reconciliation_module_1 = require("../broker-reconciliation/broker-reconciliation.module");
const performance_fees_module_1 = require("../performance-fees/performance-fees.module");
const performance_fee_billing_cycle_service_1 = require("./services/performance-fee-billing-cycle.service");
const performance_billing_controller_1 = require("./performance-billing.controller");
let PerformanceBillingModule = class PerformanceBillingModule {
};
exports.PerformanceBillingModule = PerformanceBillingModule;
exports.PerformanceBillingModule = PerformanceBillingModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([performance_fee_billing_cycle_entity_1.PerformanceFeeBillingCycle]),
            audit_module_1.AuditModule,
            broker_reconciliation_module_1.BrokerReconciliationModule,
            performance_fees_module_1.PerformanceFeesModule,
        ],
        controllers: [performance_billing_controller_1.PerformanceBillingController],
        providers: [performance_fee_billing_cycle_service_1.PerformanceFeeBillingCycleService],
        exports: [performance_fee_billing_cycle_service_1.PerformanceFeeBillingCycleService],
    })
], PerformanceBillingModule);
//# sourceMappingURL=performance-billing.module.js.map