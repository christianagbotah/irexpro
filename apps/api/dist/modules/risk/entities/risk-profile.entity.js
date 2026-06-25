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
exports.RiskProfile = void 0;
const typeorm_1 = require("typeorm");
let RiskProfile = class RiskProfile {
};
exports.RiskProfile = RiskProfile;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], RiskProfile.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid', unique: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], RiskProfile.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'kill_switch_active', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], RiskProfile.prototype, "killSwitchActive", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'kill_switch_reason', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], RiskProfile.prototype, "killSwitchReason", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'max_daily_loss_percent',
        type: 'numeric',
        precision: 5,
        scale: 2,
        default: '5.00',
    }),
    __metadata("design:type", String)
], RiskProfile.prototype, "maxDailyLossPercent", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'max_drawdown_percent',
        type: 'numeric',
        precision: 5,
        scale: 2,
        default: '10.00',
    }),
    __metadata("design:type", String)
], RiskProfile.prototype, "maxDrawdownPercent", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_open_trades', type: 'integer', default: 3 }),
    __metadata("design:type", Number)
], RiskProfile.prototype, "maxOpenTrades", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'max_daily_trades', type: 'integer', default: 10 }),
    __metadata("design:type", Number)
], RiskProfile.prototype, "maxDailyTrades", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'max_position_size_lot',
        type: 'numeric',
        precision: 8,
        scale: 4,
        default: '0.1000',
    }),
    __metadata("design:type", String)
], RiskProfile.prototype, "maxPositionSizeLot", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'min_stop_loss_pips',
        type: 'numeric',
        precision: 8,
        scale: 2,
        default: '5.00',
    }),
    __metadata("design:type", String)
], RiskProfile.prototype, "minStopLossPips", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'allowed_instruments', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], RiskProfile.prototype, "allowedInstruments", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'max_volatility_score',
        type: 'numeric',
        precision: 4,
        scale: 2,
        default: '0.85',
    }),
    __metadata("design:type", String)
], RiskProfile.prototype, "maxVolatilityScore", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reject_low_liquidity', type: 'boolean', default: true }),
    __metadata("design:type", Boolean)
], RiskProfile.prototype, "rejectLowLiquidity", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], RiskProfile.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], RiskProfile.prototype, "updatedAt", void 0);
exports.RiskProfile = RiskProfile = __decorate([
    (0, typeorm_1.Entity)({ name: 'risk_profiles', schema: 'trading' })
], RiskProfile);
//# sourceMappingURL=risk-profile.entity.js.map