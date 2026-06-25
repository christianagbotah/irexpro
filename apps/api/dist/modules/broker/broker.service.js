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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BrokerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const broker_connection_entity_1 = require("./entities/broker-connection.entity");
const broker_account_entity_1 = require("./entities/broker-account.entity");
const broker_adapter_registry_1 = require("./adapters/broker-adapter.registry");
const credential_encryption_service_1 = require("./services/credential-encryption.service");
const broker_adapter_interface_1 = require("./interfaces/broker-adapter.interface");
const broker_adapter_errors_1 = require("./interfaces/broker-adapter.errors");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
let BrokerService = BrokerService_1 = class BrokerService {
    constructor(connectionRepo, accountRepo, adapterRegistry, encryptionService, auditService) {
        this.connectionRepo = connectionRepo;
        this.accountRepo = accountRepo;
        this.adapterRegistry = adapterRegistry;
        this.encryptionService = encryptionService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(BrokerService_1.name);
    }
    async findConnectionsByUser(userId) {
        return this.connectionRepo.find({
            where: { userId },
            order: { createdAt: 'DESC' },
        });
    }
    async findConnectionById(connectionId, userId) {
        const connection = await this.connectionRepo.findOne({
            where: { id: connectionId, userId },
        });
        if (!connection) {
            throw new common_1.NotFoundException('Broker connection not found');
        }
        return connection;
    }
    async findActiveConnectionForUser(userId) {
        return this.connectionRepo.findOne({
            where: { userId, status: broker_adapter_interface_1.BrokerConnectionStatus.CONNECTED },
            order: { createdAt: 'DESC' },
        });
    }
    getSupportedBrokers() {
        return this.adapterRegistry.getSupportedBrokers();
    }
    async testCredentials(dto, userId, ipAddress) {
        const adapter = this.adapterRegistry.getAdapter(dto.brokerId);
        adapter.setMode(dto.accountType);
        const credentials = {
            apiKey: dto.apiKey,
            apiSecret: dto.apiSecret,
            accountId: dto.accountId,
            serverUrl: dto.serverUrl,
            additionalParams: dto.additionalParams,
        };
        try {
            const result = await adapter.testConnection(credentials);
            await this.auditService.log({
                actorUserId: userId,
                action: result.success
                    ? audit_action_enum_1.AuditAction.BROKER_CONNECTION_TESTED
                    : audit_action_enum_1.AuditAction.BROKER_CONNECTION_TEST_FAILED,
                ipAddress,
                metadata: {
                    brokerId: dto.brokerId,
                    accountType: dto.accountType,
                    success: result.success,
                    errorCode: result.errorCode,
                },
            });
            return {
                success: result.success,
                accountId: result.accountId,
                errorMessage: result.errorMessage,
            };
        }
        catch (err) {
            const errMsg = err instanceof broker_adapter_errors_1.BrokerAdapterError ? err.message : 'Connection test failed';
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.BROKER_CONNECTION_TEST_FAILED,
                ipAddress,
                metadata: { brokerId: dto.brokerId, error: errMsg },
                severity: audit_log_entity_1.AuditSeverity.WARNING,
            });
            return { success: false, errorMessage: errMsg };
        }
    }
    async createConnection(dto, userId, ipAddress) {
        if (!this.adapterRegistry.isSupported(dto.brokerId)) {
            throw new common_1.BadRequestException(`Unsupported broker: ${dto.brokerId}`);
        }
        const credentials = {
            apiKey: dto.apiKey,
            apiSecret: dto.apiSecret,
            accountId: dto.accountId,
            serverUrl: dto.serverUrl,
            additionalParams: dto.additionalParams,
        };
        const encrypted = this.encryptionService.encrypt(credentials);
        const connection = this.connectionRepo.create({
            userId,
            brokerId: dto.brokerId,
            brokerName: this.adapterRegistry.getAdapter(dto.brokerId).brokerName,
            displayName: dto.displayName ?? `${dto.brokerId} ${dto.accountType}`,
            accountId: dto.accountId,
            accountType: dto.accountType,
            status: broker_adapter_interface_1.BrokerConnectionStatus.DISCONNECTED,
            encryptedCredentials: encrypted.ciphertext,
            credentialIv: encrypted.iv,
            credentialTag: encrypted.tag,
            encryptionKeyId: encrypted.keyId,
        });
        const saved = await this.connectionRepo.save(connection);
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.BROKER_CONNECTION_CREATED,
            resourceType: 'BrokerConnection',
            resourceId: saved.id,
            ipAddress,
            metadata: {
                brokerId: dto.brokerId,
                accountId: dto.accountId,
                accountType: dto.accountType,
            },
        });
        this.logger.log(`Broker connection created: id=${saved.id} broker=${dto.brokerId} user=${userId}`);
        return saved;
    }
    async connectBroker(connectionId, userId, ipAddress) {
        const connection = await this.findConnectionById(connectionId, userId);
        const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
        if (!connection.encryptedCredentials || !connection.credentialIv || !connection.credentialTag) {
            throw new common_1.BadRequestException('Broker connection has no stored credentials');
        }
        await this.connectionRepo.update(connectionId, {
            status: broker_adapter_interface_1.BrokerConnectionStatus.CONNECTING,
            consecutiveFailureCount: 0,
        });
        const credentials = this.encryptionService.decrypt({
            ciphertext: connection.encryptedCredentials,
            iv: connection.credentialIv,
            tag: connection.credentialTag,
            keyId: connection.encryptionKeyId ?? 'env-key-v1',
        });
        adapter.setMode(connection.accountType);
        try {
            const result = await adapter.connect(credentials);
            if (!result.success) {
                await this.connectionRepo.update(connectionId, {
                    status: broker_adapter_interface_1.BrokerConnectionStatus.ERROR,
                    lastErrorMessage: result.error ?? 'Connection rejected by broker',
                    consecutiveFailureCount: () => 'consecutive_failure_count + 1',
                });
                await this.auditService.log({
                    actorUserId: userId,
                    action: audit_action_enum_1.AuditAction.BROKER_CONNECT_FAILED,
                    resourceType: 'BrokerConnection',
                    resourceId: connectionId,
                    ipAddress,
                    metadata: { brokerId: connection.brokerId, error: result.error },
                    severity: audit_log_entity_1.AuditSeverity.WARNING,
                });
                throw new common_1.BadRequestException(`Broker connection failed: ${result.error}`);
            }
            await this.upsertBrokerAccount(connectionId, result.currency);
            await this.connectionRepo.update(connectionId, {
                status: broker_adapter_interface_1.BrokerConnectionStatus.CONNECTED,
                accountId: result.accountId,
                accountCurrency: result.currency,
                lastHealthCheckAt: new Date(),
                consecutiveFailureCount: 0,
                lastErrorMessage: null,
            });
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.BROKER_CONNECTED,
                resourceType: 'BrokerConnection',
                resourceId: connectionId,
                ipAddress,
                metadata: {
                    brokerId: connection.brokerId,
                    accountId: result.accountId,
                    accountType: result.accountType,
                    currency: result.currency,
                },
            });
            this.logger.log(`Broker connected: id=${connectionId} account=${result.accountId} user=${userId}`);
        }
        finally {
            Object.keys(credentials).forEach((k) => {
                credentials[k] = null;
            });
        }
        return this.findConnectionById(connectionId, userId);
    }
    async disconnectBroker(connectionId, userId, ipAddress) {
        const connection = await this.findConnectionById(connectionId, userId);
        if (connection.status === broker_adapter_interface_1.BrokerConnectionStatus.CONNECTED) {
            try {
                const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
                await adapter.disconnect();
            }
            catch (err) {
                this.logger.warn(`Adapter disconnect error for connection ${connectionId}: ${err.message}`);
            }
        }
        await this.connectionRepo.update(connectionId, {
            status: broker_adapter_interface_1.BrokerConnectionStatus.DISCONNECTED,
        });
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.BROKER_DISCONNECTED,
            resourceType: 'BrokerConnection',
            resourceId: connectionId,
            ipAddress,
            metadata: { brokerId: connection.brokerId },
        });
    }
    async deleteConnection(connectionId, userId, ipAddress) {
        const connection = await this.findConnectionById(connectionId, userId);
        if (connection.status === broker_adapter_interface_1.BrokerConnectionStatus.CONNECTED) {
            await this.disconnectBroker(connectionId, userId, ipAddress);
        }
        await this.connectionRepo.softDelete(connectionId);
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.BROKER_CONNECTION_DELETED,
            resourceType: 'BrokerConnection',
            resourceId: connectionId,
            ipAddress,
            metadata: { brokerId: connection.brokerId },
        });
    }
    async enableLiveTrading(connectionId, userId, ipAddress) {
        const connection = await this.findConnectionById(connectionId, userId);
        if (connection.accountType !== broker_adapter_interface_1.BrokerMode.LIVE) {
            throw new common_1.BadRequestException('Only LIVE account connections can have live trading enabled');
        }
        const demoConnection = await this.connectionRepo.findOne({
            where: {
                userId,
                brokerId: connection.brokerId,
                accountType: broker_adapter_interface_1.BrokerMode.DEMO,
                demoValidated: true,
            },
        });
        if (!demoConnection) {
            throw new common_1.ForbiddenException('DEMO mode must be validated before LIVE trading can be enabled. ' +
                'Connect and validate a DEMO account for this broker first.');
        }
        await this.connectionRepo.update(connectionId, { liveTradingEnabled: true });
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.BROKER_LIVE_TRADING_ENABLED,
            resourceType: 'BrokerConnection',
            resourceId: connectionId,
            ipAddress,
            metadata: { brokerId: connection.brokerId },
            severity: audit_log_entity_1.AuditSeverity.WARNING,
        });
    }
    async getAllConnectedConnectionIds() {
        const connections = await this.connectionRepo.find({
            where: { status: broker_adapter_interface_1.BrokerConnectionStatus.CONNECTED },
            select: ['id'],
        });
        return connections.map((c) => c.id);
    }
    async healthCheck(connectionId) {
        const connection = await this.connectionRepo.findOne({ where: { id: connectionId } });
        if (!connection || connection.status !== broker_adapter_interface_1.BrokerConnectionStatus.CONNECTED)
            return false;
        const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
        if (!connection.encryptedCredentials || !connection.credentialIv || !connection.credentialTag) {
            this.logger.warn(`Connection ${connectionId} has no credentials — cannot health check`);
            return false;
        }
        const credentials = this.encryptionService.decrypt({
            ciphertext: connection.encryptedCredentials,
            iv: connection.credentialIv,
            tag: connection.credentialTag,
            keyId: connection.encryptionKeyId ?? 'env-key-v1',
        });
        adapter.setMode(connection.accountType);
        try {
            await adapter.connect(credentials);
            const balance = await adapter.getAccountBalance();
            await this.connectionRepo.update(connectionId, {
                lastHealthCheckAt: new Date(),
                consecutiveFailureCount: 0,
                lastErrorMessage: null,
            });
            await this.upsertBrokerAccount(connectionId, balance.currency, {
                balance: balance.balance,
                equity: balance.equity,
            });
            return true;
        }
        catch (err) {
            const failureCount = (connection.consecutiveFailureCount ?? 0) + 1;
            const SUSPEND_THRESHOLD = 3;
            await this.connectionRepo.update(connectionId, {
                consecutiveFailureCount: failureCount,
                lastErrorMessage: err.message,
                lastHealthCheckAt: new Date(),
                ...(failureCount >= SUSPEND_THRESHOLD
                    ? { status: broker_adapter_interface_1.BrokerConnectionStatus.SUSPENDED }
                    : {}),
            });
            if (failureCount >= SUSPEND_THRESHOLD) {
                this.logger.error(`Broker connection ${connectionId} suspended after ${failureCount} consecutive failures`);
                await this.auditService.log({
                    action: audit_action_enum_1.AuditAction.BROKER_SUSPENDED_HEALTH_FAILURE,
                    resourceType: 'BrokerConnection',
                    resourceId: connectionId,
                    metadata: {
                        brokerId: connection.brokerId,
                        userId: connection.userId,
                        failureCount,
                    },
                    severity: audit_log_entity_1.AuditSeverity.CRITICAL,
                });
            }
            return false;
        }
    }
    async hasActiveConnection(userId) {
        const connection = await this.findActiveConnectionForUser(userId);
        return connection !== null;
    }
    async getBrokerAccountState(connectionId) {
        const account = await this.accountRepo.findOne({
            where: { brokerConnectionId: connectionId },
        });
        if (!account)
            return null;
        return {
            balance: account.balance,
            equity: account.equity,
            freeMargin: account.freeMargin,
            currency: account.currency ?? 'USD',
        };
    }
    async upsertBrokerAccount(connectionId, currency, updates) {
        const existing = await this.accountRepo.findOne({
            where: { brokerConnectionId: connectionId },
        });
        if (existing) {
            await this.accountRepo.update(existing.id, {
                currency: currency ?? existing.currency,
                balance: updates?.balance ?? existing.balance,
                equity: updates?.equity ?? existing.equity,
                syncedAt: new Date(),
            });
        }
        else {
            await this.accountRepo.save(this.accountRepo.create({
                brokerConnectionId: connectionId,
                currency: currency ?? null,
                balance: updates?.balance ?? '0',
                equity: updates?.equity ?? '0',
                syncedAt: new Date(),
            }));
        }
    }
};
exports.BrokerService = BrokerService;
exports.BrokerService = BrokerService = BrokerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(broker_connection_entity_1.BrokerConnection)),
    __param(1, (0, typeorm_1.InjectRepository)(broker_account_entity_1.BrokerAccount)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        broker_adapter_registry_1.BrokerAdapterRegistry,
        credential_encryption_service_1.CredentialEncryptionService,
        audit_service_1.AuditService])
], BrokerService);
//# sourceMappingURL=broker.service.js.map