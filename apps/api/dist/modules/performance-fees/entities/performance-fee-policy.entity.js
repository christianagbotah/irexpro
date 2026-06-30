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
exports.PerformanceFeePolicy = exports.AppliesToMode = exports.CalculationMode = exports.BillingFrequency = void 0;
const typeorm_1 = require("typeorm");
var BillingFrequency;
(function (BillingFrequency) {
    BillingFrequency["MONTHLY"] = "MONTHLY";
    BillingFrequency["QUARTERLY"] = "QUARTERLY";
    BillingFrequency["ANNUAL"] = "ANNUAL";
    BillingFrequency["ON_PROFIT_EVENT"] = "ON_PROFIT_EVENT";
})(BillingFrequency || (exports.BillingFrequency = BillingFrequency = {}));
var CalculationMode;
(function (CalculationMode) {
    CalculationMode["HIGH_WATER_MARK"] = "HIGH_WATER_MARK";
})(CalculationMode || (exports.CalculationMode = CalculationMode = {}));
var AppliesToMode;
(function (AppliesToMode) {
    AppliesToMode["REALISED_PROFIT_ONLY"] = "REALISED_PROFIT_ONLY";
})(AppliesToMode || (exports.AppliesToMode = AppliesToMode = {}));
let PerformanceFeePolicy = class PerformanceFeePolicy {
};
exports.PerformanceFeePolicy = PerformanceFeePolicy;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], PerformanceFeePolicy.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'plan_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], PerformanceFeePolicy.prototype, "planId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'name', type: 'varchar', length: 200 }),
    __metadata("design:type", String)
], PerformanceFeePolicy.prototype, "name", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fee_percent', type: 'numeric', precision: 7, scale: 4 }),
    __metadata("design:type", String)
], PerformanceFeePolicy.prototype, "feePercent", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'billing_frequency',
        type: 'enum',
        enum: BillingFrequency,
    }),
    __metadata("design:type", String)
], PerformanceFeePolicy.prototype, "billingFrequency", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'calculation_mode',
        type: 'enum',
        enum: CalculationMode,
        default: CalculationMode.HIGH_WATER_MARK,
    }),
    __metadata("design:type", String)
], PerformanceFeePolicy.prototype, "calculationMode", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'applies_to',
        type: 'enum',
        enum: AppliesToMode,
        default: AppliesToMode.REALISED_PROFIT_ONLY,
    }),
    __metadata("design:type", String)
], PerformanceFeePolicy.prototype, "appliesTo", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_active', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], PerformanceFeePolicy.prototype, "isActive", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeePolicy.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], PerformanceFeePolicy.prototype, "updatedAt", void 0);
exports.PerformanceFeePolicy = PerformanceFeePolicy = __decorate([
    (0, typeorm_1.Entity)({ name: 'performance_fee_policies', schema: 'performance_fees' })
], PerformanceFeePolicy);
//# sourceMappingURL=performance-fee-policy.entity.js.map