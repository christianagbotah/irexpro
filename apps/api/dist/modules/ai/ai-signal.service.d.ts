import { StrategyOrchestratorService } from '../strategy/strategy-orchestrator.service';
import { AuditService } from '../audit/audit.service';
import { DomainEventBus } from '../events/event-bus.service';
import { AiSignalCandidate } from './interfaces/ai-signal-candidate.interface';
import { StrategyResult } from '../strategy/interfaces/strategy.interface';
export declare class AiSignalService {
    private readonly strategyOrchestrator;
    private readonly auditService;
    private readonly eventBus;
    private readonly logger;
    constructor(strategyOrchestrator: StrategyOrchestratorService, auditService: AuditService, eventBus: DomainEventBus);
    receiveSignal(candidate: AiSignalCandidate): Promise<StrategyResult>;
    validateCandidate(candidate: AiSignalCandidate): string | null;
    forwardToStrategyOrchestrator(candidate: AiSignalCandidate): Promise<StrategyResult>;
    buildSimulatedCandidate(userId: string, dto: Partial<AiSignalCandidate>): AiSignalCandidate;
}
