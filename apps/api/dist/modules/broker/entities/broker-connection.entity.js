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
exports.BrokerConnection = void 0;
const typeorm_1 = require("typeorm");
const class_transformer_1 = require("class-transformer");
const broker_adapter_interface_1 = require("../interfaces/broker-adapter.interface");
let BrokerConnection = class BrokerConnection {
};
exports.BrokerConnection = BrokerConnection;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)('uuid'),
    __metadata("design:type", String)
], BrokerConnection.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'user_id', type: 'uuid' }),
    (0, typeorm_1.Index)(),
    __metadata("design:type", String)
], BrokerConnection.prototype, "userId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_id', type: 'varchar', length: 50 }),
    __metadata("design:type", String)
], BrokerConnection.prototype, "brokerId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'broker_name', type: 'varchar', length: 100 }),
    __metadata("design:type", String)
], BrokerConnection.prototype, "brokerName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'display_name', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "displayName", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'account_id', type: 'varchar', length: 100, nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "accountId", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'account_type',
        type: 'enum',
        enum: broker_adapter_interface_1.BrokerMode,
        default: broker_adapter_interface_1.BrokerMode.DEMO,
    }),
    __metadata("design:type", String)
], BrokerConnection.prototype, "accountType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'account_currency', type: 'varchar', length: 3, nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "accountCurrency", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'account_leverage', type: 'integer', nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "accountLeverage", void 0);
__decorate([
    (0, typeorm_1.Column)({
        name: 'status',
        type: 'enum',
        enum: broker_adapter_interface_1.BrokerConnectionStatus,
        default: broker_adapter_interface_1.BrokerConnectionStatus.DISCONNECTED,
    }),
    __metadata("design:type", String)
], BrokerConnection.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'encrypted_credentials', type: 'text', nullable: true }),
    (0, class_transformer_1.Exclude)(),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "encryptedCredentials", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'credential_iv', type: 'varchar', length: 32, nullable: true }),
    (0, class_transformer_1.Exclude)(),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "credentialIv", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'credential_tag', type: 'varchar', length: 48, nullable: true }),
    (0, class_transformer_1.Exclude)(),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "credentialTag", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'encryption_key_id', type: 'varchar', length: 255, nullable: true }),
    (0, class_transformer_1.Exclude)(),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "encryptionKeyId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_health_check_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "lastHealthCheckAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_sync_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "lastSyncAt", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'consecutive_failure_count', type: 'integer', default: 0 }),
    __metadata("design:type", Number)
], BrokerConnection.prototype, "consecutiveFailureCount", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'last_error_message', type: 'text', nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "lastErrorMessage", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'demo_validated', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], BrokerConnection.prototype, "demoValidated", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'live_trading_enabled', type: 'boolean', default: false }),
    __metadata("design:type", Boolean)
], BrokerConnection.prototype, "liveTradingEnabled", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerConnection.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at', type: 'timestamptz' }),
    __metadata("design:type", Date)
], BrokerConnection.prototype, "updatedAt", void 0);
__decorate([
    (0, typeorm_1.DeleteDateColumn)({ name: 'deleted_at', type: 'timestamptz', nullable: true }),
    __metadata("design:type", Object)
], BrokerConnection.prototype, "deletedAt", void 0);
exports.BrokerConnection = BrokerConnection = __decorate([
    (0, typeorm_1.Entity)({ name: 'broker_connections', schema: 'broker' })
], BrokerConnection);
//# sourceMappingURL=broker-connection.entity.js.map