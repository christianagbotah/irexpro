import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerTradeReconciliationRun } from './entities/broker-trade-reconciliation-run.entity';
import { BrokerReconciledTrade } from './entities/broker-reconciled-trade.entity';
import { PerformanceFeeLedgerEntry } from '../performance-fees/entities/performance-fee-ledger-entry.entity';
import { PerformanceFeePolicy } from '../performance-fees/entities/performance-fee-policy.entity';
import { UserSubscription } from '../subscriptions/entities/user-subscription.entity';
import { BrokerModule } from '../broker/broker.module';
import { AuditModule } from '../audit/audit.module';
import { BrokerTradeReconciliationService } from './services/broker-trade-reconciliation.service';
import { ClosedTradeNormalizerService } from './services/closed-trade-normalizer.service';
import { BrokerReconciliationController } from './broker-reconciliation.controller';

/**
 * BrokerReconciliationModule
 *
 * Provides:
 * - BrokerTradeReconciliationService — core reconciliation orchestrator
 * - ClosedTradeNormalizerService     — converts raw adapter trades to NormalizedClosedTrade
 * - BrokerReconciliationController   — REST API surface
 *
 * Depends on:
 * - BrokerModule (BrokerService for connection/credential access)
 * - AuditModule  (AuditService for event logging)
 *
 * DOES NOT depend on PerformanceFeesModule to avoid circular dependencies.
 * PerformanceFeeLedgerEntry and PerformanceFeePolicy are imported as TypeORM
 * features directly so that the full PerformanceFeeService is not pulled in.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      BrokerTradeReconciliationRun,
      BrokerReconciledTrade,
      PerformanceFeeLedgerEntry,
      PerformanceFeePolicy,
      UserSubscription,
    ]),
    BrokerModule,
    AuditModule,
  ],
  controllers: [BrokerReconciliationController],
  providers: [BrokerTradeReconciliationService, ClosedTradeNormalizerService],
  exports: [BrokerTradeReconciliationService],
})
export class BrokerReconciliationModule {}
