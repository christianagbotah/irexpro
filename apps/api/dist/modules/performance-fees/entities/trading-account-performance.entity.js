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
exports.TradingAccountPerformance = void 0;
const typeorm_1 = require("typeorm");
let TradingAccountPerformance = class TradingAccountPerformance {
};
exports.TradingAccountPerformance = TradingAccountPerformance;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], TradingAccountPerformance.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'account_reference', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], TradingAccountPerformance.prototype, "accountReference", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'current_high_water_mark', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "currentHighWaterMark", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_calculated_equity', type: 'bigint', nullable: true }),
    __metadata("design:type", Object)
], TradingAccountPerformance.prototype, "lastCalculatedEquity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_realised_balance', type: 'bigint', nullable: true }),
    __metadata("design:type", Object)
], TradingAccountPerformance.prototype, "lastRealisedBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_deposits', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "totalDeposits", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_withdrawals', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "totalWithdrawals", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_realised_profit', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "totalRealisedProfit", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'total_fees_charged', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], TradingAccountPerformance.prototype, "totalFeesCharged", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_calculation_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], TradingAccountPerformance.prototype, "lastCalculationAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradingAccountPerformance.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradingAccountPerformance.prototype, "updatedAt", void 0);
exports.TradingAccountPerformance = TradingAccountPerformance = __decorate([
    (0, typeorm_1.Entity)({ name: 'trading_account_performances', schema: 'performance_fees' }),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['userId', 'brokerConnectionId'])
], TradingAccountPerformance);
//# sourceMappingURL=trading-account-performance.entity.js.map