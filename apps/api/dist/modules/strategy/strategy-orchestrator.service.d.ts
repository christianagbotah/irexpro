import { RiskService } from '../risk/risk.service';
import { ExecutionService } from '../execution/execution.service';
import { BrokerService } from '../broker/broker.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../events/event-bus.service';
import { AiSignalCandidate, StrategyResult } from './interfaces/strategy.interface';
export declare class StrategyOrchestratorService {
    private readonly riskService;
    private readonly executionService;
    private readonly brokerService;
    private readonly subscriptionsService;
    private readonly auditService;
    private readonly eventBus;
    private readonly logger;
    constructor(riskService: RiskService, executionService: ExecutionService, brokerService: BrokerService, subscriptionsService: SubscriptionsService, auditService: AuditService, eventBus: DomainEventBus);
    processSignal(candidate: AiSignalCandidate): Promise<StrategyResult>;
    private validateStructure;
    private publishIgnored;
}
