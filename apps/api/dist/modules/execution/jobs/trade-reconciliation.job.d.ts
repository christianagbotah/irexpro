import { WorkerHost } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { Trade } from '../entities/trade.entity';
import { BrokerService } from '../../broker/broker.service';
import { BrokerAdapterRegistry } from '../../broker/adapters/broker-adapter.registry';
import { CredentialEncryptionService } from '../../broker/services/credential-encryption.service';
import { AuditService } from '../../audit/audit.service';
export declare const TRADE_RECONCILIATION_QUEUE = "trade-reconciliation";
export declare const TRADE_RECONCILIATION_JOB = "reconcile-open-trades";
export declare const RECONCILIATION_INTERVAL_MS = 60000;
export declare class TradeReconciliationJob extends WorkerHost {
    private tradeRepo;
    private brokerService;
    private adapterRegistry;
    private encryptionService;
    private auditService;
    private readonly logger;
    constructor(tradeRepo: Repository<Trade>, brokerService: BrokerService, adapterRegistry: BrokerAdapterRegistry, encryptionService: CredentialEncryptionService, auditService: AuditService);
    process(job: Job): Promise<{
        reconciled: number;
        closed: number;
        errors: number;
    }>;
    private reconcileTrade;
}
