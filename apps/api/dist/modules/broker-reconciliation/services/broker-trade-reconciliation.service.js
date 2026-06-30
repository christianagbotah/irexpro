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
var BrokerTradeReconciliationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrokerTradeReconciliationService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const currency_minor_units_1 = require("./currency-minor-units");
const broker_trade_reconciliation_run_entity_1 = require("../entities/broker-trade-reconciliation-run.entity");
const broker_reconciled_trade_entity_1 = require("../entities/broker-reconciled-trade.entity");
const performance_fee_ledger_entry_entity_1 = require("../../performance-fees/entities/performance-fee-ledger-entry.entity");
const performance_fee_policy_entity_1 = require("../../performance-fees/entities/performance-fee-policy.entity");
const user_subscription_entity_1 = require("../../subscriptions/entities/user-subscription.entity");
const broker_service_1 = require("../../broker/broker.service");
const broker_adapter_interface_1 = require("../../broker/interfaces/broker-adapter.interface");
const audit_service_1 = require("../../audit/audit.service");
const audit_action_enum_1 = require("../../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../../audit/entities/audit-log.entity");
const closed_trade_normalizer_service_1 = require("./closed-trade-normalizer.service");
const MAX_WINDOW_DAYS = 90;
let BrokerTradeReconciliationService = BrokerTradeReconciliationService_1 = class BrokerTradeReconciliationService {
    constructor(runRepo, tradeRepo, ledgerRepo, policyRepo, subscriptionRepo, brokerService, normalizerService, auditService) {
        this.runRepo = runRepo;
        this.tradeRepo = tradeRepo;
        this.ledgerRepo = ledgerRepo;
        this.policyRepo = policyRepo;
        this.subscriptionRepo = subscriptionRepo;
        this.brokerService = brokerService;
        this.normalizerService = normalizerService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(BrokerTradeReconciliationService_1.name);
    }
    async getRuns(userId) {
        const where = userId ? { userId } : {};
        return this.runRepo.find({
            where,
            order: { createdAt: 'DESC' },
            take: 100,
        });
    }
    async getReconciledTrades(userId, brokerConnectionId) {
        const where = {};
        if (userId)
            where['userId'] = userId;
        if (brokerConnectionId)
            where['brokerConnectionId'] = brokerConnectionId;
        return this.tradeRepo.find({
            where,
            order: { closedAt: 'DESC' },
            take: 500,
        });
    }
    async runReconciliation(userId, brokerConnectionId, fromTime, toTime, actorId, ipAddress) {
        this.validateTimeRange(fromTime, toTime);
        const connection = await this.brokerService.findConnectionById(brokerConnectionId, userId);
        if (connection.accountType !== broker_adapter_interface_1.BrokerMode.LIVE) {
            throw new common_1.BadRequestException(`Broker connection ${brokerConnectionId} is not a LIVE account ` +
                `(accountType=${connection.accountType}). ` +
                `Demo, paper, and backtest accounts are never fee-eligible.`);
        }
        const currency = connection.accountCurrency ?? 'USD';
        if (!(0, currency_minor_units_1.isSupportedCurrency)(currency)) {
            throw new common_1.BadRequestException(`Unsupported account currency '${currency}' for minor-unit conversion. ` +
                `Reconciliation aborted to avoid miscalculating the fee basis.`);
        }
        const run = await this.runRepo.save(this.runRepo.create({
            userId,
            brokerConnectionId,
            status: broker_trade_reconciliation_run_entity_1.ReconciliationRunStatus.PENDING,
            fromTime,
            toTime,
            metadata: {
                actorId,
                brokerProvider: connection.brokerId,
            },
        }));
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.BROKER_RECONCILIATION_STARTED,
            resourceType: 'BrokerTradeReconciliationRun',
            resourceId: run.id,
            ipAddress,
            metadata: {
                userId,
                brokerConnectionId,
                fromTime: fromTime.toISOString(),
                toTime: toTime.toISOString(),
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        await this.runRepo.update(run.id, {
            status: broker_trade_reconciliation_run_entity_1.ReconciliationRunStatus.RUNNING,
            startedAt: new Date(),
        });
        const feeContext = await this.loadFeeEligibilityContext(userId);
        let rawTrades;
        try {
            const result = await this.brokerService.getClosedTradesForConnection(brokerConnectionId, userId, fromTime, toTime);
            rawTrades = result.trades;
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'Adapter error';
            await this.finaliseRun(run.id, broker_trade_reconciliation_run_entity_1.ReconciliationRunStatus.FAILED, 0, 0, 0, 0, errorMsg);
            await this.auditService.log({
                actorUserId: actorId,
                actorType: 'ADMIN',
                action: audit_action_enum_1.AuditAction.BROKER_RECONCILIATION_FAILED,
                resourceType: 'BrokerTradeReconciliationRun',
                resourceId: run.id,
                ipAddress,
                metadata: { userId, brokerConnectionId, error: errorMsg },
                severity: audit_log_entity_1.AuditSeverity.WARNING,
            });
            this.logger.error(`[Recon] Run ${run.id} FAILED — adapter error: ${errorMsg}`);
            return this.runRepo.findOne({ where: { id: run.id } });
        }
        const { valid: normalised, skipped } = this.normalizerService.normalize(rawTrades, connection.brokerId, currency);
        let newLedgerEntriesCreated = 0;
        let duplicateTradesSkipped = 0;
        let failedTrades = 0;
        let hasWarnings = false;
        for (const trade of normalised) {
            try {
                const result = await this.processTrade(trade, userId, brokerConnectionId, connection.brokerId, run.id, currency, feeContext, actorId);
                if (result.isDuplicate) {
                    duplicateTradesSkipped++;
                }
                else if (result.ledgerEntryCreated) {
                    newLedgerEntriesCreated++;
                }
            }
            catch (err) {
                failedTrades++;
                hasWarnings = true;
                this.logger.warn(`[Recon] Run ${run.id} — trade ${trade.brokerTradeId} failed: ${err.message}`);
            }
        }
        if (skipped.length > 0)
            hasWarnings = true;
        const totalSeen = rawTrades.length;
        const status = failedTrades > 0 || hasWarnings
            ? broker_trade_reconciliation_run_entity_1.ReconciliationRunStatus.COMPLETED_WITH_WARNINGS
            : broker_trade_reconciliation_run_entity_1.ReconciliationRunStatus.COMPLETED;
        await this.finaliseRun(run.id, status, totalSeen, newLedgerEntriesCreated, duplicateTradesSkipped, failedTrades, null);
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.BROKER_RECONCILIATION_COMPLETED,
            resourceType: 'BrokerTradeReconciliationRun',
            resourceId: run.id,
            ipAddress,
            metadata: {
                userId,
                brokerConnectionId,
                status,
                totalSeen,
                newLedgerEntriesCreated,
                duplicateTradesSkipped,
                failedTrades,
                skippedByNormalizer: skipped.length,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[Recon] Run ${run.id} ${status}: seen=${totalSeen} new=${newLedgerEntriesCreated} ` +
            `dup=${duplicateTradesSkipped} failed=${failedTrades} normSkipped=${skipped.length}`);
        return this.runRepo.findOne({ where: { id: run.id } });
    }
    async processTrade(trade, userId, brokerConnectionId, brokerProvider, runId, currency, feeContext, actorId) {
        const isFeeEligible = this.isFeeEligible(trade, feeContext);
        const netPnl = BigInt(trade.netRealisedPnl);
        let reconciledTrade;
        try {
            reconciledTrade = await this.tradeRepo.save(this.tradeRepo.create({
                userId,
                brokerConnectionId,
                brokerProvider,
                brokerTradeId: trade.brokerTradeId,
                brokerOrderId: trade.brokerOrderId,
                instrument: trade.instrument,
                direction: trade.direction,
                volume: trade.volume,
                openedAt: trade.openedAt,
                closedAt: trade.closedAt,
                entryPrice: trade.entryPrice,
                exitPrice: trade.exitPrice,
                realisedPnl: trade.grossRealisedPnl,
                commission: trade.commission,
                swap: trade.swap,
                netRealisedPnl: trade.netRealisedPnl,
                currency,
                reconciliationRunId: runId,
                ledgerEntryId: null,
                sourceType: broker_reconciled_trade_entity_1.TradeSourceType.LIVE_BROKER,
                isFeeEligible,
            }));
        }
        catch (err) {
            if (err instanceof typeorm_2.QueryFailedError && err.code === '23505') {
                const backfilled = await this.backfillMissingLedgerEntry(userId, brokerConnectionId, trade.brokerTradeId, currency, runId, actorId);
                if (backfilled) {
                    return { isDuplicate: false, ledgerEntryCreated: true };
                }
                await this.auditService.log({
                    actorUserId: actorId,
                    actorType: 'ADMIN',
                    action: audit_action_enum_1.AuditAction.BROKER_TRADE_RECONCILIATION_SKIPPED,
                    resourceType: 'BrokerReconciledTrade',
                    resourceId: `${userId}/${brokerConnectionId}/${trade.brokerTradeId}`,
                    metadata: {
                        userId,
                        brokerConnectionId,
                        brokerTradeId: trade.brokerTradeId,
                        reason: 'duplicate',
                    },
                    severity: audit_log_entity_1.AuditSeverity.INFO,
                });
                return { isDuplicate: true, ledgerEntryCreated: false };
            }
            throw err;
        }
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.BROKER_TRADE_RECONCILED,
            resourceType: 'BrokerReconciledTrade',
            resourceId: reconciledTrade.id,
            metadata: {
                userId,
                brokerConnectionId,
                brokerTradeId: trade.brokerTradeId,
                instrument: trade.instrument,
                direction: trade.direction,
                netRealisedPnl: trade.netRealisedPnl,
                currency,
                isFeeEligible,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        if (!isFeeEligible || netPnl === 0n) {
            return { isDuplicate: false, ledgerEntryCreated: false };
        }
        const entryType = netPnl > 0n
            ? performance_fee_ledger_entry_entity_1.LedgerEntryType.REALISED_TRADE_PROFIT
            : performance_fee_ledger_entry_entity_1.LedgerEntryType.REALISED_TRADE_LOSS;
        const ledgerEntry = await this.ledgerRepo.save(this.ledgerRepo.create({
            userId,
            assessmentId: null,
            brokerConnectionId,
            entryType,
            currency,
            amount: trade.netRealisedPnl,
            sourceReference: trade.brokerTradeId,
            occurredAt: trade.closedAt,
            metadata: {
                brokerTradeId: trade.brokerTradeId,
                brokerReconciledTradeId: reconciledTrade.id,
                instrument: trade.instrument,
                direction: trade.direction,
                runId,
            },
        }));
        await this.tradeRepo.update(reconciledTrade.id, {
            ledgerEntryId: ledgerEntry.id,
        });
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_LEDGER_ENTRY_CREATED_FROM_BROKER_TRADE,
            resourceType: 'PerformanceFeeLedgerEntry',
            resourceId: ledgerEntry.id,
            metadata: {
                userId,
                brokerConnectionId,
                brokerTradeId: trade.brokerTradeId,
                brokerReconciledTradeId: reconciledTrade.id,
                entryType,
                amount: trade.netRealisedPnl,
                currency,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        return { isDuplicate: false, ledgerEntryCreated: true };
    }
    async backfillMissingLedgerEntry(userId, brokerConnectionId, brokerTradeId, currency, runId, actorId) {
        const existing = await this.tradeRepo.findOne({
            where: { userId, brokerConnectionId, brokerTradeId },
        });
        if (!existing)
            return false;
        if (!existing.isFeeEligible)
            return false;
        if (existing.ledgerEntryId)
            return false;
        const netPnl = BigInt(existing.netRealisedPnl);
        if (netPnl === 0n)
            return false;
        const entryType = netPnl > 0n
            ? performance_fee_ledger_entry_entity_1.LedgerEntryType.REALISED_TRADE_PROFIT
            : performance_fee_ledger_entry_entity_1.LedgerEntryType.REALISED_TRADE_LOSS;
        const ledgerEntry = await this.ledgerRepo.save(this.ledgerRepo.create({
            userId,
            assessmentId: null,
            brokerConnectionId,
            entryType,
            currency,
            amount: existing.netRealisedPnl,
            sourceReference: existing.brokerTradeId,
            occurredAt: existing.closedAt,
            metadata: {
                brokerTradeId: existing.brokerTradeId,
                brokerReconciledTradeId: existing.id,
                instrument: existing.instrument,
                direction: existing.direction,
                runId,
                backfilled: true,
            },
        }));
        await this.tradeRepo.update(existing.id, { ledgerEntryId: ledgerEntry.id });
        await this.auditService.log({
            actorUserId: actorId,
            actorType: 'ADMIN',
            action: audit_action_enum_1.AuditAction.PERFORMANCE_FEE_LEDGER_ENTRY_CREATED_FROM_BROKER_TRADE,
            resourceType: 'PerformanceFeeLedgerEntry',
            resourceId: ledgerEntry.id,
            metadata: {
                userId,
                brokerConnectionId,
                brokerTradeId: existing.brokerTradeId,
                brokerReconciledTradeId: existing.id,
                entryType,
                amount: existing.netRealisedPnl,
                currency,
                backfilled: true,
            },
            severity: audit_log_entity_1.AuditSeverity.INFO,
        });
        this.logger.log(`[Recon] Backfilled missing ledger entry for reconciled trade ${existing.id} ` +
            `(brokerTradeId=${brokerTradeId})`);
        return true;
    }
    isFeeEligible(trade, context) {
        if (!context.hasActiveSubscription)
            return false;
        if (!context.hasPerformanceFeePolicy)
            return false;
        if (BigInt(trade.netRealisedPnl) === 0n)
            return false;
        return true;
    }
    async loadFeeEligibilityContext(userId) {
        const subscription = await this.subscriptionRepo.findOne({
            where: { userId, status: user_subscription_entity_1.SubscriptionStatus.ACTIVE },
            order: { createdAt: 'DESC' },
        });
        if (!subscription) {
            return { hasActiveSubscription: false, hasPerformanceFeePolicy: false };
        }
        const policy = await this.findApplicablePolicy(subscription.subscriptionPlanId);
        return {
            hasActiveSubscription: true,
            hasPerformanceFeePolicy: policy !== null,
        };
    }
    async findApplicablePolicy(planId) {
        if (planId) {
            const planPolicy = await this.policyRepo.findOne({
                where: { planId, isActive: true },
            });
            if (planPolicy)
                return planPolicy;
        }
        const globalPolicy = await this.policyRepo.findOne({
            where: { planId: (0, typeorm_2.IsNull)(), isActive: true },
        });
        return globalPolicy ?? null;
    }
    validateTimeRange(fromTime, toTime) {
        const now = new Date();
        if (fromTime >= toTime) {
            throw new common_1.BadRequestException('fromTime must be before toTime');
        }
        if (toTime > now) {
            throw new common_1.BadRequestException('toTime must not be in the future');
        }
        const windowMs = toTime.getTime() - fromTime.getTime();
        const maxMs = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
        if (windowMs > maxMs) {
            throw new common_1.BadRequestException(`Reconciliation window exceeds maximum of ${MAX_WINDOW_DAYS} days`);
        }
    }
    async finaliseRun(runId, status, totalBrokerTradesSeen, newLedgerEntriesCreated, duplicateTradesSkipped, failedTrades, errorSummary) {
        await this.runRepo.update(runId, {
            status,
            completedAt: new Date(),
            totalBrokerTradesSeen,
            newLedgerEntriesCreated,
            duplicateTradesSkipped,
            failedTrades,
            errorSummary,
        });
    }
};
exports.BrokerTradeReconciliationService = BrokerTradeReconciliationService;
exports.BrokerTradeReconciliationService = BrokerTradeReconciliationService = BrokerTradeReconciliationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(broker_trade_reconciliation_run_entity_1.BrokerTradeReconciliationRun)),
    __param(1, (0, typeorm_1.InjectRepository)(broker_reconciled_trade_entity_1.BrokerReconciledTrade)),
    __param(2, (0, typeorm_1.InjectRepository)(performance_fee_ledger_entry_entity_1.PerformanceFeeLedgerEntry)),
    __param(3, (0, typeorm_1.InjectRepository)(performance_fee_policy_entity_1.PerformanceFeePolicy)),
    __param(4, (0, typeorm_1.InjectRepository)(user_subscription_entity_1.UserSubscription)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        broker_service_1.BrokerService,
        closed_trade_normalizer_service_1.ClosedTradeNormalizerService,
        audit_service_1.AuditService])
], BrokerTradeReconciliationService);
//# sourceMappingURL=broker-trade-reconciliation.service.js.map