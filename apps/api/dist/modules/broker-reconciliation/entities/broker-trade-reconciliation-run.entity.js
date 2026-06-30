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
exports.BrokerTradeReconciliationRun = exports.ReconciliationRunStatus = void 0;
const typeorm_1 = require("typeorm");
var ReconciliationRunStatus;
(function (ReconciliationRunStatus) {
    ReconciliationRunStatus["PENDING"] = "PENDING";
    ReconciliationRunStatus["RUNNING"] = "RUNNING";
    ReconciliationRunStatus["COMPLETED"] = "COMPLETED";
    ReconciliationRunStatus["COMPLETED_WITH_WARNINGS"] = "COMPLETED_WITH_WARNINGS";
    ReconciliationRunStatus["FAILED"] = "FAILED";
})(ReconciliationRunStatus || (exports.ReconciliationRunStatus = ReconciliationRunStatus = {}));
let BrokerTradeReconciliationRun = class BrokerTradeReconciliationRun {
};
exports.BrokerTradeReconciliationRun = BrokerTradeReconciliationRun;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BrokerTradeReconciliationRun.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerTradeReconciliationRun.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerTradeReconciliationRun.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: ReconciliationRunStatus,
        default: ReconciliationRunStatus.PENDING,
    }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerTradeReconciliationRun.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'started_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BrokerTradeReconciliationRun.prototype, "startedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'completed_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BrokerTradeReconciliationRun.prototype, "completedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'from_time', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerTradeReconciliationRun.prototype, "fromTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'to_time', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerTradeReconciliationRun.prototype, "toTime", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_broker_trades_seen', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], BrokerTradeReconciliationRun.prototype, "totalBrokerTradesSeen", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'new_ledger_entries_created', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], BrokerTradeReconciliationRun.prototype, "newLedgerEntriesCreated", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'duplicate_trades_skipped', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], BrokerTradeReconciliationRun.prototype, "duplicateTradesSkipped", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'failed_trades', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], BrokerTradeReconciliationRun.prototype, "failedTrades", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_summary', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], BrokerTradeReconciliationRun.prototype, "errorSummary", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'metadata', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], BrokerTradeReconciliationRun.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerTradeReconciliationRun.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerTradeReconciliationRun.prototype, "updatedAt", void 0);
exports.BrokerTradeReconciliationRun = BrokerTradeReconciliationRun = __decorate([
    (0, typeorm_1.Entity)({ name: 'broker_trade_reconciliation_runs', schema: 'broker_reconciliation' }),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['userId', 'brokerConnectionId']),
    (0, typeorm_1.Index)(['status']),
    (0, typeorm_1.Index)(['createdAt'])
], BrokerTradeReconciliationRun);
//# sourceMappingURL=broker-trade-reconciliation-run.entity.js.map