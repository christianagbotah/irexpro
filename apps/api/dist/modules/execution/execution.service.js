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
var ExecutionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionService = void 0;
const crypto = require("crypto");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const trade_entity_1 = require("./entities/trade.entity");
const trading_session_entity_1 = require("./entities/trading-session.entity");
const broker_service_1 = require("../broker/broker.service");
const broker_adapter_registry_1 = require("../broker/adapters/broker-adapter.registry");
const credential_encryption_service_1 = require("../broker/services/credential-encryption.service");
const audit_service_1 = require("../audit/audit.service");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const broker_adapter_errors_1 = require("../broker/interfaces/broker-adapter.errors");
const EXECUTION_TIMEOUT_MS = 10_000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];
let ExecutionService = ExecutionService_1 = class ExecutionService {
    constructor(tradeRepo, sessionRepo, brokerService, adapterRegistry, encryptionService, auditService, dataSource) {
        this.tradeRepo = tradeRepo;
        this.sessionRepo = sessionRepo;
        this.brokerService = brokerService;
        this.adapterRegistry = adapterRegistry;
        this.encryptionService = encryptionService;
        this.auditService = auditService;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(ExecutionService_1.name);
    }
    async executeTrade(userId, riskDecision) {
        if (riskDecision.decision !== 'APPROVED') {
            const code = riskDecision.decision === 'REJECTED' || riskDecision.decision === 'SUSPENDED'
                ? riskDecision.rejectionCode
                : 'UNKNOWN';
            this.logger.warn(`executeTrade() blocked non-APPROVED decision for user ${userId}. ` +
                `Decision: ${riskDecision.decision}, Code: ${code}`);
            throw new common_1.ForbiddenException(`Trade blocked: Risk Engine decision was ${riskDecision.decision} [${code}]. ` +
                `Execution requires APPROVED status.`);
        }
        const order = riskDecision.validatedOrder;
        const signalId = riskDecision.signalId;
        const idempotencyKey = this.generateIdempotencyKey(userId, order.instrument, order.direction, signalId);
        const existing = await this.tradeRepo.findOne({ where: { idempotencyKey } });
        if (existing) {
            this.logger.log(`Duplicate signal detected for key ${idempotencyKey} — returning existing trade ${existing.id}`);
            return existing;
        }
        const connection = await this.brokerService.findActiveConnectionForUser(userId);
        if (!connection) {
            throw new common_1.ForbiddenException('No active broker connection available for trade execution');
        }
        const trade = await this.tradeRepo.save(this.tradeRepo.create({
            userId,
            brokerConnectionId: connection.id,
            signalId,
            idempotencyKey,
            instrument: order.instrument,
            direction: order.direction,
            lotSize: order.lotSize,
            requestedEntryPrice: order.entryPrice,
            stopLoss: order.stopLoss,
            takeProfit: order.takeProfit,
            trailingStopPips: order.trailingStopPips ?? null,
            status: trade_entity_1.TradeStatus.PENDING,
        }));
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.TRADE_PREPARED,
            resourceType: 'Trade',
            resourceId: trade.id,
            metadata: {
                instrument: order.instrument,
                direction: order.direction,
                lotSize: order.lotSize,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
                idempotencyKey,
                signalId,
            },
        });
        try {
            const credentials = this.encryptionService.decrypt({
                ciphertext: connection.encryptedCredentials,
                iv: connection.credentialIv,
                tag: connection.credentialTag,
                keyId: connection.encryptionKeyId,
            });
            const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
            adapter.setMode(connection.accountType);
            await adapter.connect(credentials);
            Object.keys(credentials).forEach((k) => { credentials[k] = null; });
            const brokerRequest = {
                instrument: order.instrument,
                direction: order.direction,
                lotSize: order.lotSize,
                stopLoss: order.stopLoss,
                takeProfit: order.takeProfit,
                idempotencyKey,
                comment: order.idempotencyKey,
            };
            const result = await this.submitWithRetry(adapter, brokerRequest);
            if (result.success && result.externalOrderId) {
                await this.tradeRepo.update(trade.id, {
                    status: trade_entity_1.TradeStatus.OPEN,
                    externalOrderId: result.externalOrderId,
                    fillPrice: result.filledPrice ?? order.entryPrice,
                    openedAt: new Date(),
                });
                trade.status = trade_entity_1.TradeStatus.OPEN;
                trade.externalOrderId = result.externalOrderId;
                await this.auditService.log({
                    actorUserId: userId,
                    action: audit_action_enum_1.AuditAction.TRADE_OPENED,
                    resourceType: 'Trade',
                    resourceId: trade.id,
                    metadata: {
                        externalOrderId: result.externalOrderId,
                        fillPrice: result.filledPrice,
                        instrument: order.instrument,
                        direction: order.direction,
                        lotSize: order.lotSize,
                        signalId,
                    },
                });
                this.logger.log(`Trade OPENED: id=${trade.id} externalId=${result.externalOrderId} ` +
                    `${order.direction} ${order.instrument} ${order.lotSize} lots`);
            }
            else {
                await this.tradeRepo.update(trade.id, {
                    status: trade_entity_1.TradeStatus.REJECTED,
                    brokerRejectionReason: result.brokerMessage ?? 'Broker rejected order',
                });
                trade.status = trade_entity_1.TradeStatus.REJECTED;
                await this.auditService.log({
                    actorUserId: userId,
                    action: audit_action_enum_1.AuditAction.TRADE_REJECTED,
                    resourceType: 'Trade',
                    resourceId: trade.id,
                    metadata: { brokerMessage: result.brokerMessage, signalId },
                    severity: audit_log_entity_1.AuditSeverity.WARNING,
                });
            }
        }
        catch (err) {
            this.logger.error(`Trade execution error for trade ${trade.id}: ${err.message}`, err.stack);
            await this.tradeRepo.update(trade.id, {
                status: trade_entity_1.TradeStatus.RECONCILIATION_PENDING,
                brokerRejectionReason: `Execution error: ${err.message}`,
            });
            trade.status = trade_entity_1.TradeStatus.RECONCILIATION_PENDING;
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.TRADE_SUBMITTED,
                resourceType: 'Trade',
                resourceId: trade.id,
                metadata: { error: err.message, status: 'RECONCILIATION_PENDING' },
                severity: audit_log_entity_1.AuditSeverity.CRITICAL,
            });
        }
        return trade;
    }
    async closeTrade(tradeId, userId, reason) {
        const trade = await this.tradeRepo.findOne({ where: { id: tradeId, userId } });
        if (!trade) {
            throw new common_1.ForbiddenException(`Trade ${tradeId} not found or does not belong to user`);
        }
        if (trade.status !== trade_entity_1.TradeStatus.OPEN) {
            throw new common_1.ForbiddenException(`Trade ${tradeId} is not OPEN (status: ${trade.status})`);
        }
        if (!trade.externalOrderId) {
            throw new common_1.ForbiddenException(`Trade ${tradeId} has no externalOrderId — cannot close`);
        }
        const connection = await this.brokerService.findConnectionById(trade.brokerConnectionId, userId);
        const credentials = this.encryptionService.decrypt({
            ciphertext: connection.encryptedCredentials,
            iv: connection.credentialIv,
            tag: connection.credentialTag,
            keyId: connection.encryptionKeyId,
        });
        const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
        adapter.setMode(connection.accountType);
        await adapter.connect(credentials);
        Object.keys(credentials).forEach((k) => { credentials[k] = null; });
        const result = await adapter.closeOrder(trade.externalOrderId);
        const exitPrice = result.filledPrice ?? null;
        await this.tradeRepo.update(trade.id, {
            status: trade_entity_1.TradeStatus.CLOSED,
            exitPrice,
            closedAt: new Date(),
            closeReason: reason,
        });
        trade.status = trade_entity_1.TradeStatus.CLOSED;
        trade.closeReason = reason;
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.TRADE_CLOSED,
            resourceType: 'Trade',
            resourceId: trade.id,
            metadata: {
                exitPrice,
                closeReason: reason,
                externalOrderId: trade.externalOrderId,
            },
        });
        this.logger.log(`Trade CLOSED: id=${trade.id} reason=${reason} exitPrice=${exitPrice ?? 'pending'}`);
        return trade;
    }
    async countOpenTrades(userId) {
        return this.tradeRepo.count({ where: { userId, status: trade_entity_1.TradeStatus.OPEN } });
    }
    async getTodayRealisedLoss(userId) {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const result = await this.dataSource.query(`SELECT COALESCE(SUM(realised_pnl), 0) AS total
       FROM trading.trades
       WHERE user_id = $1
         AND status = 'CLOSED'
         AND closed_at >= $2
         AND realised_pnl < 0`, [userId, todayStart.toISOString()]);
        return parseFloat(result[0]?.total ?? '0');
    }
    async getOpenTrades(userId) {
        return this.tradeRepo.find({ where: { userId, status: trade_entity_1.TradeStatus.OPEN } });
    }
    async findTradeById(tradeId) {
        return this.tradeRepo.findOne({ where: { id: tradeId } });
    }
    async startSession(userId, brokerConnectionId, openingBalance) {
        const existing = await this.sessionRepo.findOne({
            where: { userId, status: trading_session_entity_1.TradingSessionStatus.ACTIVE },
        });
        if (existing)
            return existing;
        return this.sessionRepo.save(this.sessionRepo.create({
            userId,
            brokerConnectionId,
            status: trading_session_entity_1.TradingSessionStatus.ACTIVE,
            openingBalance,
            peakEquity: openingBalance,
            startedAt: new Date(),
        }));
    }
    async endSession(userId, status = trading_session_entity_1.TradingSessionStatus.ENDED) {
        await this.sessionRepo.update({ userId, status: trading_session_entity_1.TradingSessionStatus.ACTIVE }, { status, endedAt: new Date() });
    }
    async getActiveSession(userId) {
        return this.sessionRepo.findOne({ where: { userId, status: trading_session_entity_1.TradingSessionStatus.ACTIVE } });
    }
    generateIdempotencyKey(userId, instrument, direction, signalId) {
        return crypto
            .createHash('sha256')
            .update(`${userId}:${instrument}:${direction}:${signalId}`)
            .digest('hex');
    }
    async submitWithRetry(adapter, request) {
        let lastError = null;
        for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
            try {
                const result = await Promise.race([
                    adapter.placeOrder(request),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Broker order timeout')), EXECUTION_TIMEOUT_MS)),
                ]);
                return result;
            }
            catch (err) {
                lastError = err;
                const isRetryable = err instanceof Error &&
                    'errorCode' in err &&
                    broker_adapter_errors_1.RETRYABLE_BROKER_ERRORS.has(err.errorCode);
                if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS - 1) {
                    throw err;
                }
                const delay = RETRY_DELAYS_MS[attempt] ?? 9_000;
                this.logger.warn(`Broker order attempt ${attempt + 1} failed (${lastError.message}) — ` +
                    `retrying in ${delay}ms`);
                await new Promise((r) => setTimeout(r, delay));
            }
        }
        throw lastError ?? new Error('All retry attempts exhausted');
    }
};
exports.ExecutionService = ExecutionService;
exports.ExecutionService = ExecutionService = ExecutionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(trade_entity_1.Trade)),
    __param(1, (0, typeorm_1.InjectRepository)(trading_session_entity_1.TradingSession)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        broker_service_1.BrokerService,
        broker_adapter_registry_1.BrokerAdapterRegistry,
        credential_encryption_service_1.CredentialEncryptionService,
        audit_service_1.AuditService,
        typeorm_2.DataSource])
], ExecutionService);
//# sourceMappingURL=execution.service.js.map