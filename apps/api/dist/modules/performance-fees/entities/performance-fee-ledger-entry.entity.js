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
exports.PerformanceFeeLedgerEntry = exports.LedgerEntryType = void 0;
const typeorm_1 = require("typeorm");
var LedgerEntryType;
(function (LedgerEntryType) {
    LedgerEntryType["DEPOSIT"] = "DEPOSIT";
    LedgerEntryType["WITHDRAWAL"] = "WITHDRAWAL";
    LedgerEntryType["REALISED_TRADE_PROFIT"] = "REALISED_TRADE_PROFIT";
    LedgerEntryType["REALISED_TRADE_LOSS"] = "REALISED_TRADE_LOSS";
    LedgerEntryType["FEE_ASSESSED"] = "FEE_ASSESSED";
    LedgerEntryType["FEE_PAID"] = "FEE_PAID";
    LedgerEntryType["ADJUSTMENT"] = "ADJUSTMENT";
})(LedgerEntryType || (exports.LedgerEntryType = LedgerEntryType = {}));
let PerformanceFeeLedgerEntry = class PerformanceFeeLedgerEntry {
};
exports.PerformanceFeeLedgerEntry = PerformanceFeeLedgerEntry;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PerformanceFeeLedgerEntry.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PerformanceFeeLedgerEntry.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'assessment_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], PerformanceFeeLedgerEntry.prototype, "assessmentId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], PerformanceFeeLedgerEntry.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'entry_type', type: 'enum', enum: LedgerEntryType }),
    __metadata("design:type", String)
], PerformanceFeeLedgerEntry.prototype, "entryType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], PerformanceFeeLedgerEntry.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'amount', type: 'bigint' }),
    __metadata("design:type", String)
], PerformanceFeeLedgerEntry.prototype, "amount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'source_reference', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeLedgerEntry.prototype, "sourceReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'occurred_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeeLedgerEntry.prototype, "occurredAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'metadata', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeLedgerEntry.prototype, "metadata", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeeLedgerEntry.prototype, "createdAt", void 0);
exports.PerformanceFeeLedgerEntry = PerformanceFeeLedgerEntry = __decorate([
    (0, typeorm_1.Entity)({ name: 'performance_fee_ledger_entries', schema: 'performance_fees' }),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['userId', 'brokerConnectionId']),
    (0, typeorm_1.Index)(['occurredAt']),
    (0, typeorm_1.Index)(['userId', 'occurredAt'])
], PerformanceFeeLedgerEntry);
//# sourceMappingURL=performance-fee-ledger-entry.entity.js.map