import { OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
export declare class BrokerHealthCheckProducer implements OnModuleInit {
    private readonly healthQueue;
    private readonly logger;
    constructor(healthQueue: Queue);
    onModuleInit(): Promise<void>;
    private scheduleHealthCheck;
}
