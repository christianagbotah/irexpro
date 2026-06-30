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
var TradeReconciliationJob_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradeReconciliationJob = exports.RECONCILIATION_INTERVAL_MS = exports.TRADE_RECONCILIATION_JOB = exports.TRADE_RECONCILIATION_QUEUE = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const trade_entity_1 = require("../entities/trade.entity");
const broker_service_1 = require("../../broker/broker.service");
const broker_adapter_registry_1 = require("../../broker/adapters/broker-adapter.registry");
const credential_encryption_service_1 = require("../../broker/services/credential-encryption.service");
const audit_service_1 = require("../../audit/audit.service");
const audit_action_enum_1 = require("../../../common/enums/audit-action.enum");
exports.TRADE_RECONCILIATION_QUEUE = 'trade-reconciliation';
exports.TRADE_RECONCILIATION_JOB = 'reconcile-open-trades';
exports.RECONCILIATION_INTERVAL_MS = 60_000;
let TradeReconciliationJob = TradeReconciliationJob_1 = class TradeReconciliationJob extends bullmq_1.WorkerHost {
    constructor(tradeRepo, brokerService, adapterRegistry, encryptionService, auditService) {
        super();
        this.tradeRepo = tradeRepo;
        this.brokerService = brokerService;
        this.adapterRegistry = adapterRegistry;
        this.encryptionService = encryptionService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(TradeReconciliationJob_1.name);
    }
    async process(job) {
        this.logger.debug(`Running trade reconciliation job ${job.id}`);
        const openTrades = await this.tradeRepo.find({
            where: [
                { status: trade_entity_1.TradeStatus.OPEN },
                { status: trade_entity_1.TradeStatus.RECONCILIATION_PENDING },
            ],
        });
        if (openTrades.length === 0) {
            return { reconciled: 0, closed: 0, errors: 0 };
        }
        this.logger.log(`Reconciling ${openTrades.length} open/pending trades`);
        let closed = 0;
        let errors = 0;
        await Promise.allSettled(openTrades.map(async (trade) => {
            try {
                const wasClosed = await this.reconcileTrade(trade);
                if (wasClosed)
                    closed++;
            }
            catch (err) {
                errors++;
                this.logger.error(`Reconciliation error for trade ${trade.id}: ${err.message}`);
            }
        }));
        this.logger.log(`Reconciliation complete: ${openTrades.length} checked, ${closed} closed, ${errors} errors`);
        return { reconciled: openTrades.length, closed, errors };
    }
    async reconcileTrade(trade) {
        if (!trade.externalOrderId) {
            return false;
        }
        const connection = await this.brokerService.findConnectionById(trade.brokerConnectionId, trade.userId);
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
        const position = await adapter.getPositionById(trade.externalOrderId);
        if (position === null) {
            let exitPrice = null;
            let realisedPnl = null;
            try {
                const closedTrades = await adapter.getClosedTrades(trade.openedAt ?? new Date(0), new Date());
                const match = closedTrades.find((ct) => ct.externalOrderId === trade.externalOrderId);
                if (match) {
                    exitPrice = match.closePrice;
                    realisedPnl = match.realisedPnl;
                }
            }
            catch (err) {
                this.logger.warn(`Could not fetch closed trade details for ${trade.id}: ${err.message}`);
            }
            await this.tradeRepo.update(trade.id, {
                status: trade_entity_1.TradeStatus.CLOSED,
                exitPrice,
                realisedPnl,
                closedAt: new Date(),
                closeReason: trade_entity_1.TradeCloseReason.BROKER_CLOSE,
            });
            await this.auditService.log({
                actorUserId: trade.userId,
                action: audit_action_enum_1.AuditAction.TRADE_CLOSED,
                resourceType: 'Trade',
                resourceId: trade.id,
                metadata: {
                    closeReason: trade_entity_1.TradeCloseReason.BROKER_CLOSE,
                    exitPrice,
                    realisedPnl,
                    externalOrderId: trade.externalOrderId,
                    source: 'reconciliation',
                },
            });
            this.logger.log(`Trade ${trade.id} reconciled as CLOSED. ` +
                `exitPrice=${exitPrice ?? 'unknown'} pnl=${realisedPnl ?? 'unknown'}`);
            return true;
        }
        if (trade.status === trade_entity_1.TradeStatus.RECONCILIATION_PENDING) {
            await this.tradeRepo.update(trade.id, { status: trade_entity_1.TradeStatus.OPEN });
            this.logger.log(`Trade ${trade.id} recovered: RECONCILIATION_PENDING → OPEN`);
        }
        return false;
    }
};
exports.TradeReconciliationJob = TradeReconciliationJob;
exports.TradeReconciliationJob = TradeReconciliationJob = TradeReconciliationJob_1 = __decorate([
    (0, common_1.Injectable)(),
    (0, bullmq_1.Processor)(exports.TRADE_RECONCILIATION_QUEUE),
    __param(0, (0, typeorm_1.InjectRepository)(trade_entity_1.Trade)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        broker_service_1.BrokerService,
        broker_adapter_registry_1.BrokerAdapterRegistry,
        credential_encryption_service_1.CredentialEncryptionService,
        audit_service_1.AuditService])
], TradeReconciliationJob);
//# sourceMappingURL=trade-reconciliation.job.js.map