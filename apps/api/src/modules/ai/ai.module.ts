import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiSignalService } from './ai-signal.service';
import { AiDecisionExplorerService } from './ai-decision-explorer.service';
import { AiController } from './ai.controller';
import { AiDecisionExplorerController } from './ai-decision-explorer.controller';
import { StrategyModule } from '../strategy/strategy.module';
import { AuditModule } from '../audit/audit.module';
import { ExecutionModule } from '../execution/execution.module';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';

/**
 * AiModule — AI Signal Engine intake, routing, and browser-safe decision evidence.
 *
 * Provides:
 *   - AiService: legacy skeleton
 *   - AiSignalService: signal validation and Strategy Orchestrator forwarding
 *   - AiDecisionExplorerService: persisted, user-scoped decision evidence composer
 *   - AiController: DEV simulation + internal signal intake
 *   - AiDecisionExplorerController: authenticated read-only decision history
 *
 * Signal pipeline:
 *   AiSignalService → StrategyOrchestratorService → RiskService → ExecutionService
 *   (never: AiSignalService → ExecutionService or Broker directly)
 *
 * Decision Explorer reads remain outside the mutation path and compose exported
 * AuditService + ExecutionReadService projections only.
 */
@Module({
  imports: [ConfigModule, StrategyModule, AuditModule, ExecutionModule],
  controllers: [AiController, AiDecisionExplorerController],
  providers: [AiService, AiSignalService, AiDecisionExplorerService, InternalApiKeyGuard],
  exports: [AiService, AiSignalService],
})
export class AiModule {}
