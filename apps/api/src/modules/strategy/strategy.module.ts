import { forwardRef, Module } from '@nestjs/common';
import { StrategyOrchestratorService } from './strategy-orchestrator.service';
import { RiskModule } from '../risk/risk.module';
import { ExecutionModule } from '../execution/execution.module';
import { BrokerModule } from '../broker/broker.module';
import { AuditModule } from '../audit/audit.module';

/**
 * StrategyModule — Strategy Orchestrator foundation.
 *
 * Receives AiSignalCandidates and routes them through the mandatory pipeline:
 *   Signal → active-session gate → broker gate → Risk Engine → Execution Engine
 *
 * Subscription state is intentionally not part of the execution path. Users
 * may access trading without a paid plan; monetization is handled separately
 * from realised performance.
 *
 * Uses forwardRef on ExecutionModule because StrategyModule can be imported
 * by AiModule → StrategyModule → ExecutionModule (resolves safely with forwardRef).
 *
 * EventsModule is global and does not need to be imported here.
 *
 * See: docs/architecture/10-ai-trading-architecture.md
 */
@Module({
  imports: [RiskModule, forwardRef(() => ExecutionModule), BrokerModule, AuditModule],
  providers: [StrategyOrchestratorService],
  exports: [StrategyOrchestratorService],
})
export class StrategyModule {}
