import { forwardRef, Module } from '@nestjs/common';
import { TradingService } from './trading.service';
import { TradingController } from './trading.controller';
import { BrokerModule } from '../broker/broker.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { RiskModule } from '../risk/risk.module';
import { ExecutionModule } from '../execution/execution.module';
import { AuditModule } from '../audit/audit.module';

import { AiEngineClientModule } from '../ai-engine-client/ai-engine-client.module';

/**
 * TradingModule — Trading session lifecycle management.
 *
 * Uses forwardRef on ExecutionModule to prevent a possible cycle:
 *   TradingModule → ExecutionModule → RiskModule (which is also imported here)
 *
 * EventsModule is global and does not need to be imported here.
 *
 * See: docs/architecture/04-system-architecture.md §6
 */
@Module({
  imports: [
    BrokerModule,
    SubscriptionsModule,
    RiskModule,
    forwardRef(() => ExecutionModule),
    AuditModule,
    AiEngineClientModule,
  ],
  controllers: [TradingController],
  providers: [TradingService],
  exports: [TradingService],
})
export class TradingModule {}
