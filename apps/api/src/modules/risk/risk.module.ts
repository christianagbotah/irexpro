import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RiskService } from './risk.service';
import { RiskController } from './risk.controller';
import { RiskIntelligenceController } from './risk-intelligence.controller';
import { RiskIntelligenceService } from './risk-intelligence.service';
import { RiskProfile } from './entities/risk-profile.entity';
import { RiskViolation } from './entities/risk-violation.entity';
import { BrokerModule } from '../broker/broker.module';
import { AuditModule } from '../audit/audit.module';
import { ExecutionModule } from '../execution/execution.module';

/**
 * RiskModule — Non-bypassable pre-trade validation gateway.
 *
 * Circular dependency with ExecutionModule:
 *   - RiskService uses ExecutionService for live trade counts and daily P&L
 *   - ExecutionService imports RiskDecision types (no runtime DI cycle needed there)
 * Resolved via forwardRef().
 *
 * See: docs/architecture/11-risk-engine-architecture.md
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([RiskProfile, RiskViolation]),
    BrokerModule,
    AuditModule,
    forwardRef(() => ExecutionModule),
  ],
  controllers: [RiskController, RiskIntelligenceController],
  providers: [RiskService, RiskIntelligenceService],
  exports: [RiskService],
})
export class RiskModule {}
