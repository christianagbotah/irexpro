"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceFeesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const performance_fee_policy_entity_1 = require("./entities/performance-fee-policy.entity");
const trading_account_performance_entity_1 = require("./entities/trading-account-performance.entity");
const performance_fee_assessment_entity_1 = require("./entities/performance-fee-assessment.entity");
const performance_fee_ledger_entry_entity_1 = require("./entities/performance-fee-ledger-entry.entity");
const invoice_entity_1 = require("../payments/entities/invoice.entity");
const payment_transaction_entity_1 = require("../payments/entities/payment-transaction.entity");
const user_subscription_entity_1 = require("../subscriptions/entities/user-subscription.entity");
const audit_module_1 = require("../audit/audit.module");
const performance_fee_service_1 = require("./services/performance-fee.service");
const performance_fees_controller_1 = require("./performance-fees.controller");
let PerformanceFeesModule = class PerformanceFeesModule {
};
exports.PerformanceFeesModule = PerformanceFeesModule;
exports.PerformanceFeesModule = PerformanceFeesModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forFeature([
                performance_fee_policy_entity_1.PerformanceFeePolicy,
                trading_account_performance_entity_1.TradingAccountPerformance,
                performance_fee_assessment_entity_1.PerformanceFeeAssessment,
                performance_fee_ledger_entry_entity_1.PerformanceFeeLedgerEntry,
                invoice_entity_1.Invoice,
                payment_transaction_entity_1.PaymentTransaction,
                user_subscription_entity_1.UserSubscription,
            ]),
            audit_module_1.AuditModule,
        ],
        controllers: [performance_fees_controller_1.PerformanceFeesController],
        providers: [performance_fee_service_1.PerformanceFeeService],
        exports: [performance_fee_service_1.PerformanceFeeService],
    })
], PerformanceFeesModule);
//# sourceMappingURL=performance-fees.module.js.map