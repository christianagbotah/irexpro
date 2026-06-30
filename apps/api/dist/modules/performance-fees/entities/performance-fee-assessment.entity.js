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
exports.PerformanceFeeAssessment = exports.AssessmentStatus = void 0;
const typeorm_1 = require("typeorm");
var AssessmentStatus;
(function (AssessmentStatus) {
    AssessmentStatus["DRAFT"] = "DRAFT";
    AssessmentStatus["ASSESSED"] = "ASSESSED";
    AssessmentStatus["INVOICED"] = "INVOICED";
    AssessmentStatus["WAIVED"] = "WAIVED";
    AssessmentStatus["PAID"] = "PAID";
    AssessmentStatus["CANCELLED"] = "CANCELLED";
})(AssessmentStatus || (exports.AssessmentStatus = AssessmentStatus = {}));
let PerformanceFeeAssessment = class PerformanceFeeAssessment {
};
exports.PerformanceFeeAssessment = PerformanceFeeAssessment;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], PerformanceFeeAssessment.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'subscription_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeAssessment.prototype, "subscriptionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'invoice_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], PerformanceFeeAssessment.prototype, "invoiceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'period_start', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], PerformanceFeeAssessment.prototype, "periodStart", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'period_end', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], PerformanceFeeAssessment.prototype, "periodEnd", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'starting_high_water_mark', type: 'bigint' }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "startingHighWaterMark", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ending_realised_balance', type: 'bigint' }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "endingRealisedBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'deposits_excluded', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "depositsExcluded", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'withdrawals_adjusted', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "withdrawalsAdjusted", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'realised_profit_for_fee', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "realisedProfitForFee", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fee_percent', type: 'numeric', precision: 7, scale: 4 }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "feePercent", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fee_amount', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "feeAmount", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: AssessmentStatus,
        default: AssessmentStatus.DRAFT,
    }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], PerformanceFeeAssessment.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'calculation_metadata', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], PerformanceFeeAssessment.prototype, "calculationMetadata", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeeAssessment.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeeAssessment.prototype, "updatedAt", void 0);
exports.PerformanceFeeAssessment = PerformanceFeeAssessment = __decorate([
    (0, typeorm_1.Entity)({ name: 'performance_fee_assessments', schema: 'performance_fees' }),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['userId', 'brokerConnectionId']),
    (0, typeorm_1.Index)(['status']),
    (0, typeorm_1.Index)(['periodStart', 'periodEnd'])
], PerformanceFeeAssessment);
//# sourceMappingURL=performance-fee-assessment.entity.js.map