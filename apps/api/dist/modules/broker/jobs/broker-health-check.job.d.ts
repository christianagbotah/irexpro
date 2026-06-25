import { WorkerHost } from '@nestjs/bullmq';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { BrokerService } from '../broker.service';
import { BrokerConnection } from '../entities/broker-connection.entity';
export declare const BROKER_HEALTH_QUEUE = "broker-health-check";
export declare const BROKER_HEALTH_JOB = "health-check-all";
export declare class BrokerHealthCheckJob extends WorkerHost {
    private readonly brokerService;
    private readonly connectionRepo;
    private readonly logger;
    constructor(brokerService: BrokerService, connectionRepo: Repository<BrokerConnection>);
    process(job: Job): Promise<{
        checked: number;
        failed: number;
    }>;
}
