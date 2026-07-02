import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PerformanceFeeBillingCycle } from './entities/performance-fee-billing-cycle.entity';
import { AuditModule } from '../audit/audit.module';
import { BrokerReconciliationModule } from '../broker-reconciliation/broker-reconciliation.module';
import { PerformanceFeesModule } from '../performance-fees/performance-fees.module';
import { PerformanceFeeBillingCycleService } from './services/performance-fee-billing-cycle.service';
import { PerformanceBillingController } from './performance-billing.controller';

/**
 * PerformanceBillingModule
 *
 * Orchestrates the end-to-end performance fee billing cycle:
 *   reconciliation (BrokerReconciliationModule)
 *     → assessment  (PerformanceFeesModule)
 *     → invoice     (PerformanceFeesModule)
 *
 * Depends on:
 *   - BrokerReconciliationModule  (exports BrokerTradeReconciliationService)
 *   - PerformanceFeesModule       (exports PerformanceFeeService)
 *   - AuditModule                 (AuditService)
 *
 * No circular dependency: neither BrokerReconciliationModule nor
 * PerformanceFeesModule imports PerformanceBillingModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([PerformanceFeeBillingCycle]),
    AuditModule,
    BrokerReconciliationModule,
    PerformanceFeesModule,
  ],
  controllers: [PerformanceBillingController],
  providers: [PerformanceFeeBillingCycleService],
  exports: [PerformanceFeeBillingCycleService],
})
export class PerformanceBillingModule {}
