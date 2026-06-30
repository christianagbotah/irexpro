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
exports.BrokerReconciledTrade = exports.TradeSourceType = void 0;
const typeorm_1 = require("typeorm");
var TradeSourceType;
(function (TradeSourceType) {
    TradeSourceType["LIVE_BROKER"] = "LIVE_BROKER";
    TradeSourceType["DEMO_BROKER"] = "DEMO_BROKER";
    TradeSourceType["PAPER_BROKER"] = "PAPER_BROKER";
    TradeSourceType["BACKTEST"] = "BACKTEST";
})(TradeSourceType || (exports.TradeSourceType = TradeSourceType = {}));
let BrokerReconciledTrade = class BrokerReconciledTrade {
};
exports.BrokerReconciledTrade = BrokerReconciledTrade;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_provider', type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "brokerProvider", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_trade_id', type: 'varchar', length: 255 }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "brokerTradeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_order_id', type: 'varchar', length: 255, nullable: true }),
    __metadata("design:type", Object)
], BrokerReconciledTrade.prototype, "brokerOrderId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'instrument', type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "instrument", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'direction', type: 'varchar', length: 4 }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "direction", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'volume', type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "volume", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'opened_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BrokerReconciledTrade.prototype, "openedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'closed_at', type: 'timestamptz' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Date)
], BrokerReconciledTrade.prototype, "closedAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'entry_price', type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], BrokerReconciledTrade.prototype, "entryPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'exit_price', type: 'varchar', length: 50, nullable: true }),
    __metadata("design:type", Object)
], BrokerReconciledTrade.prototype, "exitPrice", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'realised_pnl', type: 'bigint' }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "realisedPnl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'commission', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "commission", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'swap', type: 'bigint', default: '0' }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "swap", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'net_realised_pnl', type: 'bigint' }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "netRealisedPnl", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3 }),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'reconciliation_run_id', type: 'uuid', nullable: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Object)
], BrokerReconciledTrade.prototype, "reconciliationRunId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'ledger_entry_id', type: 'uuid', nullable: true }),
    __metadata("design:type", Object)
], BrokerReconciledTrade.prototype, "ledgerEntryId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'source_type',
        type: 'enum',
        enum: TradeSourceType,
        default: TradeSourceType.LIVE_BROKER,
    }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerReconciledTrade.prototype, "sourceType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'is_fee_eligible', type: 'boolean', default: false }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", Boolean)
], BrokerReconciledTrade.prototype, "isFeeEligible", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerReconciledTrade.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerReconciledTrade.prototype, "updatedAt", void 0);
exports.BrokerReconciledTrade = BrokerReconciledTrade = __decorate([
    (0, typeorm_1.Entity)({ name: 'broker_reconciled_trades', schema: 'broker_reconciliation' }),
    (0, typeorm_1.Index)(['userId']),
    (0, typeorm_1.Index)(['userId', 'brokerConnectionId']),
    (0, typeorm_1.Index)(['brokerTradeId']),
    (0, typeorm_1.Index)(['closedAt']),
    (0, typeorm_1.Index)(['sourceType']),
    (0, typeorm_1.Index)(['isFeeEligible']),
    (0, typeorm_1.Index)(['userId', 'brokerConnectionId', 'brokerTradeId'], { unique: true })
], BrokerReconciledTrade);
//# sourceMappingURL=broker-reconciled-trade.entity.js.map