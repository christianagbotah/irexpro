import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokerTradeReconciliationRun } from './entities/broker-trade-reconciliation-run.entity';
import { BrokerReconciledTrade } from './entities/broker-reconciled-trade.entity';
import { PerformanceFeeLedgerEntry } from '../performance-fees/entities/performance-fee-ledger-entry.entity';
import { BrokerModule } from '../broker/broker.module';
import { AuditModule } from '../audit/audit.module';
import { BrokerTradeReconciliationService } from './services/broker-trade-reconciliation.service';
import { ClosedTradeNormalizerService } from './services/closed-trade-normalizer.service';
import { BrokerReconciliationController } from './broker-reconciliation.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BrokerTradeReconciliationRun,
      BrokerReconciledTrade,
      PerformanceFeeLedgerEntry,
    ]),
    BrokerModule,
    AuditModule,
  ],
  controllers: [BrokerReconciliationController],
  providers: [BrokerTradeReconciliationService, ClosedTradeNormalizerService],
  exports: [BrokerTradeReconciliationService],
})
export class BrokerReconciliationModule {}
