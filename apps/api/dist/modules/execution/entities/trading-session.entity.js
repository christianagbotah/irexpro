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
exports.TradingSession = exports.TradingSessionStatus = void 0;
const typeorm_1 = require("typeorm");
var TradingSessionStatus;
(function (TradingSessionStatus) {
    TradingSessionStatus["ACTIVE"] = "ACTIVE";
    TradingSessionStatus["PAUSED"] = "PAUSED";
    TradingSessionStatus["SUSPENDED_RISK_LIMIT"] = "SUSPENDED_RISK_LIMIT";
    TradingSessionStatus["SUSPENDED_BROKER"] = "SUSPENDED_BROKER";
    TradingSessionStatus["ENDED"] = "ENDED";
})(TradingSessionStatus || (exports.TradingSessionStatus = TradingSessionStatus = {}));
let TradingSession = class TradingSession {
};
exports.TradingSession = TradingSession;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], TradingSession.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], TradingSession.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid' }),
    __metadata("design:type", String)
], TradingSession.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: TradingSessionStatus,
        default: TradingSessionStatus.ACTIVE,
    }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], TradingSession.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'opening_balance',
        type: 'numeric',
        precision: 15,
        scale: 2,
        nullable: true,
    }),
    __metadata("design:type", Object)
], TradingSession.prototype, "openingBalance", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'peak_equity',
        type: 'numeric',
        precision: 15,
        scale: 2,
        nullable: true,
    }),
    __metadata("design:type", Object)
], TradingSession.prototype, "peakEquity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'risk_profile_snapshot', type: 'jsonb', nullable: true }),
    __metadata("design:type", Object)
], TradingSession.prototype, "riskProfileSnapshot", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'started_at', type: 'timestamptz', default: () => 'NOW()' }),
    __metadata("design:type", Date)
], TradingSession.prototype, "startedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ended_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], TradingSession.prototype, "endedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradingSession.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], TradingSession.prototype, "updatedAt", void 0);
exports.TradingSession = TradingSession = __decorate([
    (0, typeorm_1.Entity)({ name: 'trading_sessions', schema: 'trading' })
], TradingSession);
//# sourceMappingURL=trading-session.entity.js.map