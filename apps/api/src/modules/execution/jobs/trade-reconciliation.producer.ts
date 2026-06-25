import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  RECONCILIATION_INTERVAL_MS,
  TRADE_RECONCILIATION_JOB,
  TRADE_RECONCILIATION_QUEUE,
} from './trade-reconciliation.job';

/**
 * TradeReconciliationProducer — Schedules the repeatable reconciliation job.
 *
 * Ensures exactly one reconciliation job runs every 60 seconds.
 * Stale/duplicate repeatable jobs are cleaned up on startup.
 */
@Injectable()
export class TradeReconciliationProducer implements OnModuleInit {
  private readonly logger = new Logger(TradeReconciliationProducer.name);

  constructor(
    @InjectQueue(TRADE_RECONCILIATION_QUEUE)
    private reconciliationQueue: Queue,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Remove any stale repeatable jobs from previous deployments
      const existing = await this.reconciliationQueue.getRepeatableJobs();
      await Promise.all(
        existing.map((job) => this.reconciliationQueue.removeRepeatableByKey(job.key)),
      );

      await this.reconciliationQueue.add(
        TRADE_RECONCILIATION_JOB,
        {},
        { repeat: { every: RECONCILIATION_INTERVAL_MS } },
      );

      this.logger.log(
        `Trade reconciliation job scheduled (every ${RECONCILIATION_INTERVAL_MS / 1000}s)`,
      );
    } catch (err) {
      this.logger.error(
        `Failed to schedule reconciliation job — Redis may be unavailable: ` +
          `${(err as Error).message}`,
      );
    }
  }
}
