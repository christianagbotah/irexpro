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
var TradingService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TradingService = void 0;
const common_1 = require("@nestjs/common");
const broker_service_1 = require("../broker/broker.service");
const subscriptions_service_1 = require("../subscriptions/subscriptions.service");
const risk_service_1 = require("../risk/risk.service");
const execution_service_1 = require("../execution/execution.service");
const audit_service_1 = require("../audit/audit.service");
const event_bus_service_1 = require("../events/event-bus.service");
const domain_event_type_enum_1 = require("../events/enums/domain-event-type.enum");
const audit_action_enum_1 = require("../../common/enums/audit-action.enum");
const audit_log_entity_1 = require("../audit/entities/audit-log.entity");
const trading_session_entity_1 = require("../execution/entities/trading-session.entity");
let TradingService = TradingService_1 = class TradingService {
    constructor(brokerService, subscriptionsService, riskService, executionService, auditService, eventBus) {
        this.brokerService = brokerService;
        this.subscriptionsService = subscriptionsService;
        this.riskService = riskService;
        this.executionService = executionService;
        this.auditService = auditService;
        this.eventBus = eventBus;
        this.logger = new common_1.Logger(TradingService_1.name);
    }
    async startTradingSession(userId, brokerConnectionId) {
        const canTrade = await this.subscriptionsService.canUserStartAiAutoTrading(userId);
        if (!canTrade) {
            throw new common_1.ForbiddenException('You do not have an active subscription that allows AI Auto Trading.');
        }
        const hasActiveBroker = await this.brokerService.hasActiveConnection(userId);
        if (!hasActiveBroker) {
            throw new common_1.ForbiddenException('No active broker connection. Connect and verify a broker account first.');
        }
        const connectionId = await this.resolveConnectionId(userId, brokerConnectionId);
        const killSwitchActive = await this.riskService.isKillSwitchActive(userId);
        if (killSwitchActive) {
            throw new common_1.ForbiddenException('AI trading kill switch is active. Deactivate it before starting a session.');
        }
        await this.riskService.getOrCreateProfile(userId);
        const brokerState = await this.brokerService.getBrokerAccountState(connectionId);
        const openingBalance = brokerState?.balance ?? '0';
        const session = await this.executionService.startSession(userId, connectionId, openingBalance);
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.AI_TRADING_ENABLED,
            severity: audit_log_entity_1.AuditSeverity.INFO,
            resourceType: 'TradingSession',
            resourceId: session.id,
            metadata: {
                brokerConnectionId: connectionId,
                openingBalance,
                sessionId: session.id,
            },
        });
        this.eventBus.publish(domain_event_type_enum_1.DomainEventType.TRADING_SESSION_STARTED, userId, {
            sessionId: session.id,
            userId,
            brokerConnectionId: connectionId,
            status: session.status,
            startedAt: session.startedAt,
        });
        this.logger.log(`Trading session started: userId=${userId} sessionId=${session.id}`);
        return session;
    }
    async stopTradingSession(userId, sessionId) {
        const session = await this.executionService.getActiveSession(userId);
        if (!session) {
            throw new common_1.NotFoundException('No active trading session found.');
        }
        if (session.id !== sessionId) {
            throw new common_1.ForbiddenException('Session ID does not match your active session.');
        }
        await this.executionService.endSession(userId, trading_session_entity_1.TradingSessionStatus.ENDED);
        await this.auditService.log({
            actorUserId: userId,
            action: audit_action_enum_1.AuditAction.AI_TRADING_DISABLED,
            severity: audit_log_entity_1.AuditSeverity.INFO,
            resourceType: 'TradingSession',
            resourceId: sessionId,
            metadata: { sessionId, reason: 'user-requested-stop' },
        });
        this.eventBus.publish(domain_event_type_enum_1.DomainEventType.TRADING_SESSION_STOPPED, userId, {
            sessionId,
            userId,
            brokerConnectionId: session.brokerConnectionId,
            status: trading_session_entity_1.TradingSessionStatus.ENDED,
            endedAt: new Date(),
        });
        this.logger.log(`Trading session stopped: userId=${userId} sessionId=${sessionId}`);
    }
    async getActiveSession(userId) {
        return this.executionService.getActiveSession(userId);
    }
    async getSessionById(userId, sessionId) {
        const session = await this.executionService.findSessionById(sessionId);
        if (!session || session.userId !== userId)
            return null;
        return session;
    }
    async assertBrokerGate(userId) {
        const hasActiveBroker = await this.brokerService.hasActiveConnection(userId);
        if (!hasActiveBroker) {
            throw new common_1.ForbiddenException('No active broker connection. Connect and verify a broker account before starting AI auto-trading.');
        }
    }
    async resolveConnectionId(userId, requestedId) {
        if (requestedId)
            return requestedId;
        const connection = await this.brokerService.findActiveConnectionForUser(userId);
        if (!connection) {
            throw new common_1.ForbiddenException('No active broker connection found.');
        }
        return connection.id;
    }
};
exports.TradingService = TradingService;
exports.TradingService = TradingService = TradingService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(3, (0, common_1.Inject)((0, common_1.forwardRef)(() => execution_service_1.ExecutionService))),
    __metadata("design:paramtypes", [broker_service_1.BrokerService,
        subscriptions_service_1.SubscriptionsService,
        risk_service_1.RiskService,
        execution_service_1.ExecutionService,
        audit_service_1.AuditService,
        event_bus_service_1.DomainEventBus])
], TradingService);
//# sourceMappingURL=trading.service.js.map