import { BrokerService } from '../broker/broker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { RiskService } from '../risk/risk.service';
import { ExecutionService } from '../execution/execution.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../events/event-bus.service';
import { AiEngineClient } from '../ai-engine-client/ai-engine-client.service';
import { TradingSession } from '../execution/entities/trading-session.entity';
export declare class TradingService {
    private readonly brokerService;
    private readonly subscriptionsService;
    private readonly riskService;
    private readonly executionService;
    private readonly auditService;
    private readonly eventBus;
    private readonly aiEngineClient;
    private readonly logger;
    constructor(brokerService: BrokerService, subscriptionsService: SubscriptionsService, riskService: RiskService, executionService: ExecutionService, auditService: AuditService, eventBus: DomainEventBus, aiEngineClient: AiEngineClient);
    startTradingSession(userId: string, brokerConnectionId?: string): Promise<TradingSession>;
    stopTradingSession(userId: string, sessionId: string): Promise<void>;
    getActiveSession(userId: string): Promise<TradingSession | null>;
    getSessionById(userId: string, sessionId: string): Promise<TradingSession | null>;
    assertBrokerGate(userId: string): Promise<void>;
    private resolveConnectionId;
}
