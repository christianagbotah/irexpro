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
exports.BrokerAccount = void 0;
const typeorm_1 = require("typeorm");
const broker_connection_entity_1 = require("./broker-connection.entity");
let BrokerAccount = class BrokerAccount {
};
exports.BrokerAccount = BrokerAccount;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BrokerAccount.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_connection_id', type: 'uuid', unique: true }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerAccount.prototype, "brokerConnectionId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'balance', type: 'numeric', precision: 18, scale: 8, default: '0' }),
    __metadata("design:type", String)
], BrokerAccount.prototype, "balance", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'equity', type: 'numeric', precision: 18, scale: 8, default: '0' }),
    __metadata("design:type", String)
], BrokerAccount.prototype, "equity", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'margin', type: 'numeric', precision: 18, scale: 8, default: '0' }),
    __metadata("design:type", String)
], BrokerAccount.prototype, "margin", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'free_margin', type: 'numeric', precision: 18, scale: 8, default: '0' }),
    __metadata("design:type", String)
], BrokerAccount.prototype, "freeMargin", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'margin_level', type: 'numeric', precision: 10, scale: 4, default: '0' }),
    __metadata("design:type", String)
], BrokerAccount.prototype, "marginLevel", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'currency', type: 'varchar', length: 3, nullable: true }),
    __metadata("design:type", Object)
], BrokerAccount.prototype, "currency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'leverage', type: 'integer', nullable: true }),
    __metadata("design:type", Object)
], BrokerAccount.prototype, "leverage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'open_positions_count', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], BrokerAccount.prototype, "openPositionsCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'synced_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BrokerAccount.prototype, "syncedAt", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerAccount.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerAccount.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.OneToOne)(() => broker_connection_entity_1.BrokerConnection, { onDelete: 'CASCADE' }),
    (0, typeorm_1.JoinColumn)({ name: 'broker_connection_id' }),
    __metadata("design:type", broker_connection_entity_1.BrokerConnection)
], BrokerAccount.prototype, "connection", void 0);
exports.BrokerAccount = BrokerAccount = __decorate([
    (0, typeorm_1.Entity)({ name: 'broker_accounts', schema: 'broker' })
], BrokerAccount);
//# sourceMappingURL=broker-account.entity.js.map