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
exports.RiskViolation = void 0;
const typeorm_1 = require("typeorm");
const risk_interface_1 = require("../interfaces/risk.interface");
let RiskViolation = class RiskViolation {
};
exports.RiskViolation = RiskViolation;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RiskViolation.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], RiskViolation.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'signal_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], RiskViolation.prototype, "signalId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'rejection_code',
        type: 'enum',
        enum: risk_interface_1.RiskRejectionCode,
    }),
    __metadata("design:type", String)
], RiskViolation.prototype, "rejectionCode", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'rejection_reason', type: 'text' }),
    __metadata("design:type", String)
], RiskViolation.prototype, "rejectionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'risk_context', type: 'jsonb' }),
    __metadata("design:type", Object)
], RiskViolation.prototype, "riskContext", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'evaluated_at', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], RiskViolation.prototype, "evaluatedAt", void 0);
exports.RiskViolation = RiskViolation = __decorate([
    (0, typeorm_1.Entity)({ name: 'risk_violations', schema: 'trading' })
], RiskViolation);
//# sourceMappingURL=risk-violation.entity.js.map