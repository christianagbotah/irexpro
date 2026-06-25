import { OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
export declare class TradeReconciliationProducer implements OnModuleInit {
    private reconciliationQueue;
    private readonly logger;
    constructor(reconciliationQueue: Queue);
    onModuleInit(): Promise<void>;
}
