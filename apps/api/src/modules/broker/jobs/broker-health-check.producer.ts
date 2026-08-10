import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BROKER_HEALTH_QUEUE, BROKER_HEALTH_JOB } from './broker-health-check.job';

/** Health check interval in milliseconds (default: 60 seconds) */
const HEALTH_CHECK_INTERVAL_MS = 60_000;

/**
 * BrokerHealthCheckProducer — Schedules the repeatable broker health check job.
 *
 * On module init, registers a BullMQ repeatable job that runs every 60 seconds.
 * BullMQ uses Redis to maintain the repeatable job schedule across restarts.
 *
 * See: docs/architecture/09-broker-integration-architecture.md §7
 */
@Injectable()
export class BrokerHealthCheckProducer implements OnModuleInit {
  private readonly logger = new Logger(BrokerHealthCheckProducer.name);

  constructor(
    @InjectQueue(BROKER_HEALTH_QUEUE)
    private readonly healthQueue: Queue,
  ) {}

  async onModuleInit() {
    await this.scheduleHealthCheck();
  }

  private async scheduleHealthCheck(): Promise<void> {
    try {
      // Remove any stale repeatable jobs from previous deployments
      const existing = await this.healthQueue.getRepeatableJobs();
      for (const job of existing) {
        if (job.name === BROKER_HEALTH_JOB) {
          await this.healthQueue.removeRepeatableByKey(job.key);
        }
      }

      await this.healthQueue.add(
        BROKER_HEALTH_JOB,
        {},
        {
          repeat: { every: HEALTH_CHECK_INTERVAL_MS },
          removeOnComplete: 10,
          removeOnFail: 5,
          attempts: 1,
        },
      );

      this.logger.log(`Broker health check scheduled every ${HEALTH_CHECK_INTERVAL_MS / 1000}s`);
    } catch (err) {
      // Don't crash the application if Redis is unavailable at startup
      this.logger.warn(
        `Failed to schedule broker health check job: ${(err as Error).message}. ` +
          'Check Redis connection. Health checks will not run.',
      );
    }
  }
}
