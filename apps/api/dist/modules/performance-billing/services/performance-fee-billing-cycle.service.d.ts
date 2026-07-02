import { Repository } from 'typeorm';
import { PerformanceFeeBillingCycle, BillingCycleStatus } from '../entities/performance-fee-billing-cycle.entity';
import { BrokerTradeReconciliationService } from '../../broker-reconciliation/services/broker-trade-reconciliation.service';
import { PerformanceFeeService } from '../../performance-fees/services/performance-fee.service';
import { AuditService } from '../../audit/audit.service';
export declare class PerformanceFeeBillingCycleService {
    private readonly cycleRepo;
    private readonly reconService;
    private readonly perfFeeService;
    private readonly auditService;
    private readonly logger;
    constructor(cycleRepo: Repository<PerformanceFeeBillingCycle>, reconService: BrokerTradeReconciliationService, perfFeeService: PerformanceFeeService, auditService: AuditService);
    getBillingCycle(id: string): Promise<PerformanceFeeBillingCycle>;
    listBillingCycles(filters: {
        userId?: string;
        status?: BillingCycleStatus;
        limit?: number;
    }): Promise<PerformanceFeeBillingCycle[]>;
    createBillingCycle(userId: string, brokerConnectionId: string | null, periodStart: Date, periodEnd: Date, currency: string, actorId: string, ipAddress?: string): Promise<PerformanceFeeBillingCycle>;
    runBillingCycle(cycleId: string, actorId: string, ipAddress?: string): Promise<PerformanceFeeBillingCycle>;
    runBillingCycleForUserPeriod(userId: string, brokerConnectionId: string | null, periodStart: Date, periodEnd: Date, currency: string, actorId: string, ipAddress?: string): Promise<PerformanceFeeBillingCycle>;
    cancelBillingCycle(cycleId: string, reason: string, actorId: string, ipAddress?: string): Promise<PerformanceFeeBillingCycle>;
    private validatePeriod;
    private transition;
    private failCycle;
    private safeErrorSummary;
    private findExistingCycle;
}
