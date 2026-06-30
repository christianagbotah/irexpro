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
var AiSignalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiSignalService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const strategy_orchestrator_service_1 = require("../strategy/strategy-orchestrator.service");
const audit_service_1 = require("../audit/audit.service");
const event_bus_service_1 = require("../events/event-bus.service");
const domain_event_type_enum_1 = require("../events/enums/domain-event-type.enum");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
let AiSignalService = AiSignalService_1 = class AiSignalService {
    constructor(strategyOrchestrator, auditService, eventBus) {
        this.strategyOrchestrator = strategyOrchestrator;
        this.auditService = auditService;
        this.eventBus = eventBus;
        this.logger = new common_1.Logger(AiSignalService_1.name);
    }
    async receiveSignal(candidate) {
        this.logger.log(`Signal received: id=${candidate.signalId} user=${candidate.userId} ` +
            `instrument=${candidate.instrument} direction=${candidate.direction}`);
        const validationError = this.validateCandidate(candidate);
        if (validationError) {
            this.logger.warn(`Signal ${candidate.signalId} validation failed: ${validationError}`);
            await this.auditService.log({
                actorUserId: candidate.userId,
                action: audit_action_enum_1.AuditAction.AI_SIGNAL_RECEIVED,
                severity: audit_log_entity_1.AuditSeverity.INFO,
                resourceType: 'AiSignal',
                resourceId: candidate.signalId,
                metadata: { validationError, instrument: candidate.instrument, direction: candidate.direction },
            });
            return {
                outcome: 'SIGNAL_INVALID',
                signalId: candidate.signalId,
                reason: validationError,
            };
        }
        await this.auditService.log({
            actorUserId: candidate.userId,
            action: audit_action_enum_1.AuditAction.AI_SIGNAL_RECEIVED,
            severity: audit_log_entity_1.AuditSeverity.INFO,
            resourceType: 'AiSignal',
            resourceId: candidate.signalId,
            metadata: {
                instrument: candidate.instrument,
                direction: candidate.direction,
                confidenceScore: candidate.confidenceScore,
                strategyCode: candidate.strategyCode,
                modelVersion: candidate.modelVersion,
            },
        });
        this.eventBus.publish(domain_event_type_enum_1.DomainEventType.AI_SIGNAL_RECEIVED, candidate.userId, {
            signalId: candidate.signalId,
            instrument: candidate.instrument,
            direction: candidate.direction,
            confidenceScore: candidate.confidenceScore,
            strategyCode: candidate.strategyCode,
        });
        return this.forwardToStrategyOrchestrator(candidate);
    }
    validateCandidate(candidate) {
        if (!candidate.signalId)
            return 'Missing signalId';
        if (!candidate.userId)
            return 'Missing userId';
        if (!candidate.tradingSessionId)
            return 'Missing tradingSessionId';
        if (!candidate.brokerConnectionId)
            return 'Missing brokerConnectionId';
        if (!candidate.instrument || candidate.instrument.length < 3)
            return 'Invalid instrument';
        if (!['BUY', 'SELL'].includes(candidate.direction))
            return 'Invalid direction';
        if (typeof candidate.confidenceScore !== 'number' || candidate.confidenceScore < 0 || candidate.confidenceScore > 1) {
            return 'confidenceScore must be 0–1';
        }
        if (!candidate.suggestedStopLoss || candidate.suggestedStopLoss <= 0)
            return 'Invalid suggestedStopLoss';
        if (!candidate.suggestedTakeProfit || candidate.suggestedTakeProfit <= 0)
            return 'Invalid suggestedTakeProfit';
        if (!candidate.suggestedVolume || candidate.suggestedVolume <= 0)
            return 'Invalid suggestedVolume';
        if (!candidate.strategyCode)
            return 'Missing strategyCode';
        if (!candidate.modelVersion)
            return 'Missing modelVersion';
        return null;
    }
    async forwardToStrategyOrchestrator(candidate) {
        return this.strategyOrchestrator.processSignal(candidate);
    }
    buildSimulatedCandidate(userId, dto) {
        return {
            signalId: (0, uuid_1.v4)(),
            generatedAt: new Date(),
            ...dto,
            userId,
        };
    }
};
exports.AiSignalService = AiSignalService;
exports.AiSignalService = AiSignalService = AiSignalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [strategy_orchestrator_service_1.StrategyOrchestratorService,
        audit_service_1.AuditService,
        event_bus_service_1.DomainEventBus])
], AiSignalService);
//# sourceMappingURL=ai-signal.service.js.map