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
var RealtimeService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RealtimeService = void 0;
const common_1 = require("@nestjs/common");
const event_bus_service_1 = require("../events/event-bus.service");
const domain_event_type_enum_1 = require("../events/enums/domain-event-type.enum");
const realtime_event_enum_1 = require("./events/realtime-event.enum");
let RealtimeService = RealtimeService_1 = class RealtimeService {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.logger = new common_1.Logger(RealtimeService_1.name);
        this.server = null;
        this.unsubscribers = [];
    }
    setServer(server) {
        this.server = server;
    }
    onModuleInit() {
        this.subscribeToEvents();
        this.logger.log('RealtimeService subscribed to DomainEventBus');
    }
    onModuleDestroy() {
        this.unsubscribers.forEach((unsub) => unsub());
        this.unsubscribers.length = 0;
    }
    emitToUser(userId, event, payload) {
        if (!this.server)
            return;
        this.server.to(`user:${userId}`).emit(event, payload);
        this.logger.debug(`Emitted ${event} to user:${userId}`);
    }
    emitToTradingSession(sessionId, event, payload) {
        if (!this.server)
            return;
        this.server.to(`trading-session:${sessionId}`).emit(event, payload);
        this.logger.debug(`Emitted ${event} to trading-session:${sessionId}`);
    }
    emitToAdmins(event, payload) {
        if (!this.server)
            return;
        this.server.to('admin:global').emit(event, payload);
        this.logger.debug(`Emitted ${event} to admin:global`);
    }
    subscribeToEvents() {
        this.unsubscribers.push(this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.TRADING_SESSION_STARTED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.TRADING_SESSION_STARTED, {
                sessionId: payload.sessionId,
                brokerConnectionId: payload.brokerConnectionId,
                status: payload.status,
                startedAt: payload.startedAt,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.TRADING_SESSION_STOPPED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.TRADING_SESSION_STOPPED, {
                sessionId: payload.sessionId,
                status: payload.status,
                endedAt: payload.endedAt,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.TRADE_PENDING, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.TRADE_PENDING, {
                tradeId: payload.tradeId,
                instrument: payload.instrument,
                direction: payload.direction,
                volume: payload.volume,
                status: payload.status,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.TRADE_OPENED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.TRADE_OPENED, {
                tradeId: payload.tradeId,
                instrument: payload.instrument,
                direction: payload.direction,
                volume: payload.volume,
                entryPrice: payload.entryPrice,
                status: payload.status,
            });
            if (payload.sessionId) {
                this.emitToTradingSession(payload.sessionId, realtime_event_enum_1.RealtimeEvent.TRADE_OPENED, {
                    tradeId: payload.tradeId,
                    instrument: payload.instrument,
                    direction: payload.direction,
                    volume: payload.volume,
                    entryPrice: payload.entryPrice,
                    status: payload.status,
                });
            }
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.TRADE_REJECTED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.TRADE_REJECTED, {
                tradeId: payload.tradeId,
                instrument: payload.instrument,
                direction: payload.direction,
                reason: payload.reason,
                status: payload.status,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.TRADE_CLOSED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.TRADE_CLOSED, {
                tradeId: payload.tradeId,
                instrument: payload.instrument,
                direction: payload.direction,
                exitPrice: payload.exitPrice,
                realisedPnl: payload.realisedPnl,
                reason: payload.reason,
                status: payload.status,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.RISK_SIGNAL_APPROVED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.RISK_SIGNAL_APPROVED, {
                instrument: payload.instrument,
                direction: payload.direction,
                decision: payload.decision,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.RISK_SIGNAL_REJECTED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.RISK_SIGNAL_REJECTED, {
                instrument: payload.instrument,
                direction: payload.direction,
                decision: payload.decision,
                rejectionCode: payload.rejectionCode,
                rejectionReason: payload.rejectionReason,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.BROKER_STATUS_CHANGED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.BROKER_CONNECTION_STATUS_CHANGED, {
                connectionId: payload.connectionId,
                status: payload.status,
                previousStatus: payload.previousStatus,
                reason: payload.reason,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.AI_SIGNAL_RECEIVED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.AI_SIGNAL_RECEIVED, {
                signalId: payload.signalId,
                instrument: payload.instrument,
                direction: payload.direction,
                confidenceScore: payload.confidenceScore,
                strategyCode: payload.strategyCode,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.AI_SIGNAL_IGNORED, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.AI_SIGNAL_IGNORED, {
                signalId: payload.signalId,
                instrument: payload.instrument,
                direction: payload.direction,
                ignoredReason: payload.ignoredReason,
            });
        }), this.eventBus.subscribe(domain_event_type_enum_1.DomainEventType.SYSTEM_NOTIFICATION, ({ userId, payload }) => {
            this.emitToUser(userId, realtime_event_enum_1.RealtimeEvent.SYSTEM_NOTIFICATION, {
                title: payload.title,
                message: payload.message,
                severity: payload.severity,
                code: payload.code,
            });
        }));
    }
};
exports.RealtimeService = RealtimeService;
exports.RealtimeService = RealtimeService = RealtimeService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [event_bus_service_1.DomainEventBus])
], RealtimeService);
//# sourceMappingURL=realtime.service.js.map