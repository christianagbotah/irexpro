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
exports.Trade = exports.TradeCloseReason = exports.TradeDirection = exports.TradeStatus = void 0;
const typeorm_1 = require("typeorm");
var TradeStatus;
(function (TradeStatus) {
    TradeStatus["PENDING"] = "PENDING";
    TradeStatus["OPEN"] = "OPEN";
    TradeStatus["CLOSED"] = "CLOSED";
    TradeStatus["REJECTED"] = "REJECTED";
    TradeStatus["CANCELLED"] = "CANCELLED";
    TradeStatus["RECONCILIATION_PENDING"] = "RECONCILIATION_PENDING";
})(TradeStatus || (exports.TradeStatus = TradeStatus = {}));
var TradeDirection;
(function (TradeDirection) {
    TradeDirection["BUY"] = "BUY";
    TradeDirection["SELL"] = "SELL";
})(TradeDirection || (exports.TradeDirection = TradeDirection = {}));
var TradeCloseReason;
(function (TradeCloseReason) {
    TradeCloseReason["STOP_LOSS_HIT"] = "STOP_LOSS_HIT";
    TradeCloseReason["TAKE_PROFIT_HIT"] = "TAKE_PROFIT_HIT";
    TradeCloseReason["MANUAL_CLOSE"] = "MANUAL_CLOSE";
    TradeCloseReason["AI_CLOSE_SIGNAL"] = "AI_CLOSE_SIGNAL";
    TradeCloseReason["KILL_SWITCH_FORCE_CLOSE"] = "KILL_SWITCH_FORCE_CLOSE";
    TradeCloseReason["BROKER_CLOSE"] = "BROKER_CLOSE";
    TradeCloseReason["RECONCILIATION"] = "RECONCILIATION";
})(TradeCloseReason || (exports.TradeCloseReason = TradeCloseReason = {}));
let Trade = class Trade {
};
exports.Trade = Trade;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], Trade.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], Trade.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid' }),
    __metadata("design:type", String)
], Trade.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'signal_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "signalId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'idempotency_key', type: 'varchar', length: 64, unique: true }),
    (0, typeorm_1.Index)({ unique: true }),
    __metadata("design:type", String)
], Trade.prototype, "idempotencyKey", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'instrument', type: 'varchar', length: 20 }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], Trade.prototype, "instrument", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'direction', type: 'enum', enum: TradeDirection }),
    __metadata("design:type", String)
], Trade.prototype, "direction", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'lot_size', type: 'numeric', precision: 10, scale: 4 }),
    __metadata("design:type", String)
], Trade.prototype, "lotSize", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'requested_entry_price', type: 'numeric', precision: 15, scale: 5 }),
    __metadata("design:type", String)
], Trade.prototype, "requestedEntryPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'fill_price', type: 'numeric', precision: 15, scale: 5, nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "fillPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'stop_loss', type: 'numeric', precision: 15, scale: 5 }),
    __metadata("design:type", String)
], Trade.prototype, "stopLoss", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'take_profit', type: 'numeric', precision: 15, scale: 5 }),
    __metadata("design:type", String)
], Trade.prototype, "takeProfit", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'trailing_stop_pips', type: 'numeric', precision: 8, scale: 2, nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "trailingStopPips", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'external_order_id', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "externalOrderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'status', type: 'enum', enum: TradeStatus, default: TradeStatus.PENDING }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], Trade.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'exit_price', type: 'numeric', precision: 15, scale: 5, nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "exitPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'realised_pnl', type: 'numeric', precision: 15, scale: 2, nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "realisedPnl", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'close_reason',
        type: 'enum',
        enum: TradeCloseReason,
        nullable: true,
    }),
    __metadata("design:type", Object)
], Trade.prototype, "closeReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_rejection_reason', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "brokerRejectionReason", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'opened_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "openedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'closed_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], Trade.prototype, "closedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Trade.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], Trade.prototype, "updatedAt", void 0);
exports.Trade = Trade = __decorate([
    (0, typeorm_1.Entity)({ name: 'trades', schema: 'trading' })
], Trade);
//# sourceMappingURL=trade.entity.js.map