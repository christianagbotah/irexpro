"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PerformanceFeeBillingCycle = exports.FINAL_BILLING_CYCLE_STATUSES = exports.BillingCycleStatus = void 0;
const typeorm_1 = require("typeorm");
var BillingCycleStatus;
(function (BillingCycleStatus) {
    BillingCycleStatus["DRAFT"] = "DRAFT";
    BillingCycleStatus["RECONCILING"] = "RECONCILING";
    BillingCycleStatus["RECONCILED"] = "RECONCILED";
    BillingCycleStatus["ASSESSING"] = "ASSESSING";
    BillingCycleStatus["ASSESSED"] = "ASSESSED";
    BillingCycleStatus["INVOICED"] = "INVOICED";
    BillingCycleStatus["NO_FEE_DUE"] = "NO_FEE_DUE";
    BillingCycleStatus["FAILED"] = "FAILED";
    BillingCycleStatus["CANCELLED"] = "CANCELLED";
})(BillingCycleStatus || (exports.BillingCycleStatus = BillingCycleStatus = {}));
exports.FINAL_BILLING_CYCLE_STATUSES = new Set([
    BillingCycleStatus.INVOICED,
    BillingCycleStatus.NO_FEE_DUE,
    BillingCycleStatus.CANCELLED,
]);
let PerformanceFeeBillingCycle = class PerformanceFeeBillingCycle {
};
exports.PerformanceFeeBillingCycle = PerformanceFeeBillingCycle;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PerformanceFeeBillingCycle.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PerformanceFeeBillingCycle.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'period_start', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], PerformanceFeeBillingCycle.prototype, "periodStart", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'period_end', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], PerformanceFeeBillingCycle.prototype, "periodEnd", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], PerformanceFeeBillingCycle.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: BillingCycleStatus,
        default: BillingCycleStatus.DRAFT,
    }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PerformanceFeeBillingCycle.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reconciliation_run_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "reconciliationRunId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'assessment_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "assessmentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invoice_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "invoiceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_ledger_entries_created', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], PerformanceFeeBillingCycle.prototype, "totalLedgerEntriesCreated", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_realised_profit', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], PerformanceFeeBillingCycle.prototype, "totalRealisedProfit", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fee_amount', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], PerformanceFeeBillingCycle.prototype, "feeAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_summary', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "errorSummary", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'metadata', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'created_by_user_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "createdByUserId", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeeBillingCycle.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeeBillingCycle.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'completed_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeBillingCycle.prototype, "completedAt", void 0);
exports.PerformanceFeeBillingCycle = PerformanceFeeBillingCycle = __decorate([
    (0, typeorm_1.Entity)({ name: 'performance_fee_billing_cycles', schema: 'performance_billing' }),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['userId', 'brokerConnectionId']),
    (0, typeorm_1.Index)(['status']),
    (0, typeorm_1.Index)(['periodStart', 'periodEnd']),
    (0, typeorm_1.Index)(['createdAt'])
], PerformanceFeeBillingCycle);
//# sourceMappingURL=performance-fee-billing-cycle.entity.js.map