import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiSignalService } from './ai-signal.service';
import { AiController } from './ai.controller';
import { StrategyModule } from '../strategy/strategy.module';
import { AuditModule } from '../audit/audit.module';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';

/**
 * AiModule — AI Signal Engine intake and routing.
 *
 * Provides:
 *   - AiService: legacy skeleton (Sprint 1 placeholder)
 *   - AiSignalService: signal validation and Strategy Orchestrator forwarding
 *   - AiController: DEV-ONLY simulate-signal endpoint
 *
 * Signal pipeline:
 *   AiSignalService → StrategyOrchestratorService → RiskService → ExecutionService
 *   (never: AiSignalService → ExecutionService or Broker directly)
 *
 * EventsModule is global and does not need to be imported here.
 *
 * See: docs/architecture/10-ai-trading-architecture.md
 */
@Module({
  imports: [ConfigModule, StrategyModule, AuditModule],
  controllers: [AiController],
  providers: [AiService, AiSignalService, InternalApiKeyGuard],
  exports: [AiService, AiSignalService],
})
export class AiModule {}
