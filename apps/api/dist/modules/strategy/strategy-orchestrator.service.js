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
var StrategyOrchestratorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.StrategyOrchestratorService = void 0;
const common_1 = require("@nestjs/common");
const risk_service_1 = require("../risk/risk.service");
const execution_service_1 = require("../execution/execution.service");
const broker_service_1 = require("../broker/broker.service");
const subscriptions_service_1 = require("../subscriptions/subscriptions.service");
const audit_service_1 = require("../audit/audit.service");
const event_bus_service_1 = require("../events/event-bus.service");
const domain_event_type_enum_1 = require("../events/enums/domain-event-type.enum");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const trading_session_entity_1 = require("../execution/entities/trading-session.entity");
const CONFIDENCE_THRESHOLD = 0.6;
let StrategyOrchestratorService = StrategyOrchestratorService_1 = class StrategyOrchestratorService {
    constructor(riskService, executionService, brokerService, subscriptionsService, auditService, eventBus) {
        this.riskService = riskService;
        this.executionService = executionService;
        this.brokerService = brokerService;
        this.subscriptionsService = subscriptionsService;
        this.auditService = auditService;
        this.eventBus = eventBus;
        this.logger = new common_1.Logger(StrategyOrchestratorService_1.name);
    }
    async processSignal(candidate) {
        const { signalId, userId } = candidate;
        this.logger.log(`Processing signal ${signalId} for user=${userId} instrument=${candidate.instrument}`);
        const structureError = this.validateStructure(candidate);
        if (structureError) {
            this.logger.warn(`Signal ${signalId} rejected: invalid structure — ${structureError}`);
            this.publishIgnored(candidate, structureError);
            return { outcome: 'SIGNAL_INVALID', signalId, reason: structureError };
        }
        if (candidate.confidenceScore < CONFIDENCE_THRESHOLD) {
            const reason = `Confidence ${candidate.confidenceScore} below threshold ${CONFIDENCE_THRESHOLD}`;
            this.logger.log(`Signal ${signalId} ignored: ${reason}`);
            this.publishIgnored(candidate, reason);
            return { outcome: 'LOW_CONFIDENCE', signalId, reason };
        }
        try {
            const session = await this.executionService.getActiveSession(userId);
            if (!session || session.status !== trading_session_entity_1.TradingSessionStatus.ACTIVE) {
                const reason = 'No active trading session';
                this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
                this.publishIgnored(candidate, reason);
                return { outcome: 'SESSION_INACTIVE', signalId, reason };
            }
            if (session.id !== candidate.tradingSessionId) {
                const reason = `Signal session ${candidate.tradingSessionId} does not match active session ${session.id}`;
                this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
                this.publishIgnored(candidate, reason);
                return { outcome: 'SESSION_INACTIVE', signalId, reason };
            }
        }
        catch (err) {
            const reason = 'Failed to verify trading session';
            this.logger.error(`Signal ${signalId}: session check error`, err.message);
            this.publishIgnored(candidate, reason);
            return { outcome: 'SESSION_INACTIVE', signalId, reason };
        }
        try {
            const allowed = await this.subscriptionsService.canUserStartAiAutoTrading(userId);
            if (!allowed) {
                const reason = 'No active subscription with AI Auto Trading';
                this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
                this.publishIgnored(candidate, reason);
                return { outcome: 'NO_SUBSCRIPTION', signalId, reason };
            }
        }
        catch (err) {
            const reason = 'Failed to verify subscription';
            this.logger.error(`Signal ${signalId}: subscription check error`, err.message);
            this.publishIgnored(candidate, reason);
            return { outcome: 'NO_SUBSCRIPTION', signalId, reason };
        }
        try {
            const hasBroker = await this.brokerService.hasActiveConnection(userId);
            if (!hasBroker) {
                const reason = 'No active broker connection';
                this.logger.warn(`Signal ${signalId} rejected: ${reason}`);
                this.publishIgnored(candidate, reason);
                return { outcome: 'NO_BROKER_CONNECTION', signalId, reason };
            }
        }
        catch (err) {
            const reason = 'Failed to verify broker connection';
            this.logger.error(`Signal ${signalId}: broker check error`, err.message);
            this.publishIgnored(candidate, reason);
            return { outcome: 'NO_BROKER_CONNECTION', signalId, reason };
        }
        const proposedTrade = {
            signalId: candidate.signalId,
            instrument: candidate.instrument,
            direction: candidate.direction,
            requestedLotSize: String(candidate.suggestedVolume),
            entryPrice: candidate.suggestedEntryPrice != null ? String(candidate.suggestedEntryPrice) : '0',
            stopLoss: String(candidate.suggestedStopLoss),
            takeProfit: String(candidate.suggestedTakeProfit),
            idempotencyKey: `${candidate.userId}:${candidate.signalId}`,
            volatilityScore: candidate.volatilityScore,
        };
        let riskDecision;
        try {
            riskDecision = await this.riskService.validateProposedTrade(userId, proposedTrade);
        }
        catch (err) {
            const reason = 'Risk Engine error — trade rejected (fail-closed)';
            this.logger.error(`Signal ${signalId}: risk engine exception`, err.message);
            this.eventBus.publish(domain_event_type_enum_1.DomainEventType.RISK_SIGNAL_REJECTED, userId, {
                userId,
                instrument: candidate.instrument,
                direction: candidate.direction,
                decision: 'REJECTED',
                rejectionCode: 'RISK_ENGINE_ERROR',
                rejectionReason: reason,
            });
            return { outcome: 'RISK_REJECTED', signalId, reason };
        }
        if (riskDecision.decision !== 'APPROVED') {
            const outcome = riskDecision.decision === 'SUSPENDED' ? 'RISK_SUSPENDED' : 'RISK_REJECTED';
            this.logger.warn(`Signal ${signalId} RISK ${riskDecision.decision}: ${riskDecision.rejectionCode}`);
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.AI_SIGNAL_RISK_REJECTED,
                severity: audit_log_entity_1.AuditSeverity.WARNING,
                resourceType: 'AiSignal',
                resourceId: signalId,
                metadata: {
                    instrument: candidate.instrument,
                    direction: candidate.direction,
                    rejectionCode: riskDecision.rejectionCode,
                    rejectionReason: riskDecision.rejectionReason,
                },
            });
            return {
                outcome,
                signalId,
                reason: `${riskDecision.rejectionCode}: ${riskDecision.rejectionReason}`,
            };
        }
        try {
            const trade = await this.executionService.executeTrade(userId, riskDecision);
            this.logger.log(`Signal ${signalId} executed: tradeId=${trade.id} status=${trade.status}`);
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.AI_SIGNAL_EXECUTED,
                severity: audit_log_entity_1.AuditSeverity.INFO,
                resourceType: 'Trade',
                resourceId: trade.id,
                metadata: {
                    signalId,
                    instrument: candidate.instrument,
                    direction: candidate.direction,
                    strategyCode: candidate.strategyCode,
                },
            });
            return { outcome: 'EXECUTION_SUCCEEDED', signalId, tradeId: trade.id };
        }
        catch (err) {
            const reason = `Execution failed: ${err.message}`;
            this.logger.error(`Signal ${signalId} execution error`, err.message);
            await this.auditService.log({
                actorUserId: userId,
                action: audit_action_enum_1.AuditAction.AI_SIGNAL_EXECUTION_FAILED,
                severity: audit_log_entity_1.AuditSeverity.CRITICAL,
                resourceType: 'AiSignal',
                resourceId: signalId,
                metadata: {
                    instrument: candidate.instrument,
                    direction: candidate.direction,
                    error: err.message,
                },
            });
            return { outcome: 'EXECUTION_FAILED', signalId, reason };
        }
    }
    validateStructure(candidate) {
        if (!candidate.signalId)
            return 'Missing signalId';
        if (!candidate.userId)
            return 'Missing userId';
        if (!candidate.tradingSessionId)
            return 'Missing tradingSessionId';
        if (!candidate.brokerConnectionId)
            return 'Missing brokerConnectionId';
        if (!candidate.instrument)
            return 'Missing instrument';
        if (!['BUY', 'SELL'].includes(candidate.direction))
            return 'Invalid direction';
        if (typeof candidate.confidenceScore !== 'number')
            return 'Invalid confidenceScore';
        if (!candidate.suggestedStopLoss)
            return 'Missing suggestedStopLoss';
        if (!candidate.suggestedTakeProfit)
            return 'Missing suggestedTakeProfit';
        if (!candidate.suggestedVolume || candidate.suggestedVolume <= 0)
            return 'Invalid suggestedVolume';
        return null;
    }
    publishIgnored(candidate, reason) {
        this.eventBus.publish(domain_event_type_enum_1.DomainEventType.AI_SIGNAL_IGNORED, candidate.userId, {
            signalId: candidate.signalId,
            instrument: candidate.instrument,
            direction: candidate.direction,
            confidenceScore: candidate.confidenceScore,
            strategyCode: candidate.strategyCode,
            ignoredReason: reason,
        });
    }
};
exports.StrategyOrchestratorService = StrategyOrchestratorService;
exports.StrategyOrchestratorService = StrategyOrchestratorService = StrategyOrchestratorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Inject)((0, common_1.forwardRef)(() => execution_service_1.ExecutionService))),
    __metadata("design:paramtypes", [risk_service_1.RiskService,
        execution_service_1.ExecutionService,
        broker_service_1.BrokerService,
        subscriptions_service_1.SubscriptionsService,
        audit_service_1.AuditService,
        event_bus_service_1.DomainEventBus])
], StrategyOrchestratorService);
//# sourceMappingURL=strategy-orchestrator.service.js.map