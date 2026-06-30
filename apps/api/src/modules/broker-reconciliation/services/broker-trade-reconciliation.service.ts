import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, QueryFailedError, Repository } from 'typeorm';
import { isSupportedCurrency } from './currency-minor-units';
import {
  BrokerTradeReconciliationRun,
  ReconciliationRunStatus,
} from '../entities/broker-trade-reconciliation-run.entity';
import {
  BrokerReconciledTrade,
  TradeSourceType,
} from '../entities/broker-reconciled-trade.entity';
import {
  PerformanceFeeLedgerEntry,
  LedgerEntryType,
} from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import { PerformanceFeePolicy } from '../../performance-fees/entities/performance-fee-policy.entity';
import { UserSubscription, SubscriptionStatus } from '../../subscriptions/entities/user-subscription.entity';
import { BrokerService } from '../../broker/broker.service';
import { BrokerMode } from '../../broker/interfaces/broker-adapter.interface';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../../common/enums/audit-action.enum';
import { AuditSeverity } from '../../audit/entities/audit-log.entity';
import { ClosedTradeNormalizerService } from './closed-trade-normalizer.service';
import { NormalizedClosedTrade } from '../interfaces/normalized-closed-trade.interface';

/** Maximum reconciliation window in days. */
const MAX_WINDOW_DAYS = 90;

/**
 * BrokerTradeReconciliationService
 *
 * Safely reconciles confirmed closed broker trades into the
 * PerformanceFeeLedgerEntry table so the performance-fee engine can use real
 * broker closed-trade history.
 *
 * INVARIANTS — never violated by this service:
 * 1. No live broker withdrawals.
 * 2. No auto-charge of users.
 * 3. No automatic performance-fee assessments or invoices.
 * 4. Open / unrealised trades are never used.
 * 5. Demo, paper, backtest, mock trades are never fee-eligible.
 * 6. Broker account balance is never trusted as profit basis.
 * 7. Deduplication is enforced by (userId, brokerConnectionId, brokerTradeId).
 * 8. netRealisedPnl = 0 → reconciled trade record is created but no ledger entry.
 * 9. No secrets, credentials, or raw broker payloads in audit metadata.
 * 10. All money values stay in minor currency units (bigint strings).
 */
@Injectable()
export class BrokerTradeReconciliationService {
  private readonly logger = new Logger(BrokerTradeReconciliationService.name);

  constructor(
    @InjectRepository(BrokerTradeReconciliationRun)
    private readonly runRepo: Repository<BrokerTradeReconciliationRun>,
    @InjectRepository(BrokerReconciledTrade)
    private readonly tradeRepo: Repository<BrokerReconciledTrade>,
    @InjectRepository(PerformanceFeeLedgerEntry)
    private readonly ledgerRepo: Repository<PerformanceFeeLedgerEntry>,
    @InjectRepository(PerformanceFeePolicy)
    private readonly policyRepo: Repository<PerformanceFeePolicy>,
    @InjectRepository(UserSubscription)
    private readonly subscriptionRepo: Repository<UserSubscription>,
    private readonly brokerService: BrokerService,
    private readonly normalizerService: ClosedTradeNormalizerService,
    private readonly auditService: AuditService,
  ) {}

  // ── Run management ──────────────────────────────────────────────────────────

  async getRuns(userId?: string): Promise<BrokerTradeReconciliationRun[]> {
    const where = userId ? { userId } : {};
    return this.runRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async getReconciledTrades(
    userId?: string,
    brokerConnectionId?: string,
  ): Promise<BrokerReconciledTrade[]> {
    const where: Record<string, unknown> = {};
    if (userId) where['userId'] = userId;
    if (brokerConnectionId) where['brokerConnectionId'] = brokerConnectionId;
    return this.tradeRepo.find({
      where,
      order: { closedAt: 'DESC' },
      take: 500,
    });
  }

  // ── Core reconciliation ─────────────────────────────────────────────────────

  /**
   * Run a broker trade reconciliation for the given user/connection/time range.
   *
   * Steps:
   * 1. Validate the time range.
   * 2. Verify broker connection ownership and LIVE status.
   * 3. Create a PENDING run record.
   * 4. Fetch closed trades from the broker adapter (via BrokerService).
   * 5. Normalize trades → skip invalid ones.
   * 6. Determine fee eligibility per trade.
   * 7. Persist BrokerReconciledTrade and PerformanceFeeLedgerEntry records.
   * 8. Update run counts and status.
   * 9. Emit audit events throughout.
   *
   * @param userId              Target user (must own the broker connection)
   * @param brokerConnectionId  Broker connection to reconcile
   * @param fromTime            Start of time range (inclusive)
   * @param toTime              End of time range (inclusive)
   * @param actorId             Admin/system user triggering the run
   * @param ipAddress           Request IP for audit
   */
  async runReconciliation(
    userId: string,
    brokerConnectionId: string,
    fromTime: Date,
    toTime: Date,
    actorId: string,
    ipAddress?: string,
  ): Promise<BrokerTradeReconciliationRun> {
    // ── 1. Validate time range ──────────────────────────────────────────────
    this.validateTimeRange(fromTime, toTime);

    // ── 2. Verify broker connection ─────────────────────────────────────────
    const connection = await this.brokerService.findConnectionById(
      brokerConnectionId,
      userId,
    );

    // Only LIVE accounts are eligible for performance fee reconciliation
    if (connection.accountType !== BrokerMode.LIVE) {
      throw new BadRequestException(
        `Broker connection ${brokerConnectionId} is not a LIVE account ` +
          `(accountType=${connection.accountType}). ` +
          `Demo, paper, and backtest accounts are never fee-eligible.`,
      );
    }

    // Fail closed for currencies with no known minor-unit exponent. A wrong
    // exponent would silently corrupt the fee basis (e.g. JPY inflated 100×),
    // so we abort rather than guess at 2 decimals.
    const currency = connection.accountCurrency ?? 'USD';
    if (!isSupportedCurrency(currency)) {
      throw new BadRequestException(
        `Unsupported account currency '${currency}' for minor-unit conversion. ` +
          `Reconciliation aborted to avoid miscalculating the fee basis.`,
      );
    }

    // ── 3. Create PENDING run record ────────────────────────────────────────
    const run = await this.runRepo.save(
      this.runRepo.create({
        userId,
        brokerConnectionId,
        status: ReconciliationRunStatus.PENDING,
        fromTime,
        toTime,
        metadata: {
          actorId,
          brokerProvider: connection.brokerId,
        },
      }),
    );

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.BROKER_RECONCILIATION_STARTED,
      resourceType: 'BrokerTradeReconciliationRun',
      resourceId: run.id,
      ipAddress,
      metadata: {
        userId,
        brokerConnectionId,
        fromTime: fromTime.toISOString(),
        toTime: toTime.toISOString(),
      },
      severity: AuditSeverity.INFO,
    });

    // ── 4. Mark RUNNING ─────────────────────────────────────────────────────
    await this.runRepo.update(run.id, {
      status: ReconciliationRunStatus.RUNNING,
      startedAt: new Date(),
    });

    // ── 5. Fetch user fee eligibility metadata upfront ──────────────────────
    //     (subscription + policy — loaded once per run, not per trade)
    const feeContext = await this.loadFeeEligibilityContext(userId);

    // ── 6. Fetch closed trades from broker ──────────────────────────────────
    let rawTrades: import('../../broker/interfaces/broker-adapter.interface').BrokerClosedTrade[];
    try {
      const result = await this.brokerService.getClosedTradesForConnection(
        brokerConnectionId,
        userId,
        fromTime,
        toTime,
      );
      rawTrades = result.trades;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Adapter error';
      await this.finaliseRun(run.id, ReconciliationRunStatus.FAILED, 0, 0, 0, 0, errorMsg);
      await this.auditService.log({
        actorUserId: actorId,
        actorType: 'ADMIN',
        action: AuditAction.BROKER_RECONCILIATION_FAILED,
        resourceType: 'BrokerTradeReconciliationRun',
        resourceId: run.id,
        ipAddress,
        metadata: { userId, brokerConnectionId, error: errorMsg },
        severity: AuditSeverity.WARNING,
      });
      this.logger.error(
        `[Recon] Run ${run.id} FAILED — adapter error: ${errorMsg}`,
      );
      return this.runRepo.findOne({ where: { id: run.id } }) as Promise<BrokerTradeReconciliationRun>;
    }

    // ── 7. Normalize trades (currency-aware minor-unit conversion) ──────────
    const { valid: normalised, skipped } = this.normalizerService.normalize(
      rawTrades,
      connection.brokerId,
      currency,
    );

    // ── 8. Process each normalised trade ────────────────────────────────────
    let newLedgerEntriesCreated = 0;
    let duplicateTradesSkipped = 0;
    let failedTrades = 0;
    let hasWarnings = false;

    for (const trade of normalised) {
      try {
        const result = await this.processTrade(
          trade,
          userId,
          brokerConnectionId,
          connection.brokerId,
          run.id,
          currency,
          feeContext,
          actorId,
        );
        if (result.isDuplicate) {
          duplicateTradesSkipped++;
        } else if (result.ledgerEntryCreated) {
          newLedgerEntriesCreated++;
        }
      } catch (err) {
        failedTrades++;
        hasWarnings = true;
        this.logger.warn(
          `[Recon] Run ${run.id} — trade ${trade.brokerTradeId} failed: ${(err as Error).message}`,
        );
      }
    }

    // Skipped (non-duplicate normalisation failures) also count as warnings
    if (skipped.length > 0) hasWarnings = true;

    const totalSeen = rawTrades.length;
    const status =
      failedTrades > 0 || hasWarnings
        ? ReconciliationRunStatus.COMPLETED_WITH_WARNINGS
        : ReconciliationRunStatus.COMPLETED;

    await this.finaliseRun(
      run.id,
      status,
      totalSeen,
      newLedgerEntriesCreated,
      duplicateTradesSkipped,
      failedTrades,
      null,
    );

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.BROKER_RECONCILIATION_COMPLETED,
      resourceType: 'BrokerTradeReconciliationRun',
      resourceId: run.id,
      ipAddress,
      metadata: {
        userId,
        brokerConnectionId,
        status,
        totalSeen,
        newLedgerEntriesCreated,
        duplicateTradesSkipped,
        failedTrades,
        skippedByNormalizer: skipped.length,
      },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(
      `[Recon] Run ${run.id} ${status}: seen=${totalSeen} new=${newLedgerEntriesCreated} ` +
        `dup=${duplicateTradesSkipped} failed=${failedTrades} normSkipped=${skipped.length}`,
    );

    return this.runRepo.findOne({ where: { id: run.id } }) as Promise<BrokerTradeReconciliationRun>;
  }

  // ── Trade processing ────────────────────────────────────────────────────────

  private async processTrade(
    trade: NormalizedClosedTrade,
    userId: string,
    brokerConnectionId: string,
    brokerProvider: string,
    runId: string,
    currency: string,
    feeContext: FeeEligibilityContext,
    actorId: string,
  ): Promise<{ isDuplicate: boolean; ledgerEntryCreated: boolean }> {
    // Determine fee eligibility
    const isFeeEligible = this.isFeeEligible(trade, feeContext);
    const netPnl = BigInt(trade.netRealisedPnl);

    // Attempt to insert — unique index enforces deduplication
    let reconciledTrade: BrokerReconciledTrade;
    try {
      reconciledTrade = await this.tradeRepo.save(
        this.tradeRepo.create({
          userId,
          brokerConnectionId,
          brokerProvider,
          brokerTradeId: trade.brokerTradeId,
          brokerOrderId: trade.brokerOrderId,
          instrument: trade.instrument,
          direction: trade.direction,
          volume: trade.volume,
          openedAt: trade.openedAt,
          closedAt: trade.closedAt,
          entryPrice: trade.entryPrice,
          exitPrice: trade.exitPrice,
          realisedPnl: trade.grossRealisedPnl,
          commission: trade.commission,
          swap: trade.swap,
          netRealisedPnl: trade.netRealisedPnl,
          currency,
          reconciliationRunId: runId,
          ledgerEntryId: null,
          sourceType: TradeSourceType.LIVE_BROKER,
          isFeeEligible,
        }),
      );
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === '23505') {
        // Duplicate trade — already reconciled by a prior run.
        //
        // Self-healing: if a previous run inserted the trade row but failed
        // BEFORE creating its ledger entry (e.g. a transient DB error between
        // the two writes), the realised P&L would be silently missing from the
        // fee basis forever. Detect that exact gap and backfill the ledger
        // entry now. Genuine, fully-processed duplicates are left untouched.
        const backfilled = await this.backfillMissingLedgerEntry(
          userId,
          brokerConnectionId,
          trade.brokerTradeId,
          currency,
          runId,
          actorId,
        );
        if (backfilled) {
          return { isDuplicate: false, ledgerEntryCreated: true };
        }

        await this.auditService.log({
          actorUserId: actorId,
          actorType: 'ADMIN',
          action: AuditAction.BROKER_TRADE_RECONCILIATION_SKIPPED,
          resourceType: 'BrokerReconciledTrade',
          resourceId: `${userId}/${brokerConnectionId}/${trade.brokerTradeId}`,
          metadata: {
            userId,
            brokerConnectionId,
            brokerTradeId: trade.brokerTradeId,
            reason: 'duplicate',
          },
          severity: AuditSeverity.INFO,
        });
        return { isDuplicate: true, ledgerEntryCreated: false };
      }
      throw err;
    }

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.BROKER_TRADE_RECONCILED,
      resourceType: 'BrokerReconciledTrade',
      resourceId: reconciledTrade.id,
      metadata: {
        userId,
        brokerConnectionId,
        brokerTradeId: trade.brokerTradeId,
        instrument: trade.instrument,
        direction: trade.direction,
        netRealisedPnl: trade.netRealisedPnl,
        currency,
        isFeeEligible,
      },
      severity: AuditSeverity.INFO,
    });

    // Only fee-eligible trades with non-zero P&L get a ledger entry
    if (!isFeeEligible || netPnl === 0n) {
      return { isDuplicate: false, ledgerEntryCreated: false };
    }

    // Create performance fee ledger entry
    const entryType = netPnl > 0n
      ? LedgerEntryType.REALISED_TRADE_PROFIT
      : LedgerEntryType.REALISED_TRADE_LOSS;

    const ledgerEntry = await this.ledgerRepo.save(
      this.ledgerRepo.create({
        userId,
        assessmentId: null,
        brokerConnectionId,
        entryType,
        currency,
        amount: trade.netRealisedPnl,
        sourceReference: trade.brokerTradeId,
        occurredAt: trade.closedAt,
        metadata: {
          brokerTradeId: trade.brokerTradeId,
          brokerReconciledTradeId: reconciledTrade.id,
          instrument: trade.instrument,
          direction: trade.direction,
          runId,
        },
      }),
    );

    // Link the ledger entry back to the reconciled trade
    await this.tradeRepo.update(reconciledTrade.id, {
      ledgerEntryId: ledgerEntry.id,
    });

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_FEE_LEDGER_ENTRY_CREATED_FROM_BROKER_TRADE,
      resourceType: 'PerformanceFeeLedgerEntry',
      resourceId: ledgerEntry.id,
      metadata: {
        userId,
        brokerConnectionId,
        brokerTradeId: trade.brokerTradeId,
        brokerReconciledTradeId: reconciledTrade.id,
        entryType,
        amount: trade.netRealisedPnl,
        currency,
      },
      severity: AuditSeverity.INFO,
    });

    return { isDuplicate: false, ledgerEntryCreated: true };
  }

  /**
   * Backfill a missing ledger entry for an already-reconciled trade.
   *
   * Only acts on the precise "row saved, ledger missing" gap left by a partial
   * failure: the existing reconciled trade must be fee-eligible, have non-zero
   * net P&L, and have NO linked ledger entry. Any other state (zero P&L,
   * not fee-eligible, or already linked) is a genuine duplicate and is skipped.
   *
   * Returns true if a ledger entry was created.
   */
  private async backfillMissingLedgerEntry(
    userId: string,
    brokerConnectionId: string,
    brokerTradeId: string,
    currency: string,
    runId: string,
    actorId: string,
  ): Promise<boolean> {
    const existing = await this.tradeRepo.findOne({
      where: { userId, brokerConnectionId, brokerTradeId },
    });

    if (!existing) return false;
    if (!existing.isFeeEligible) return false;
    if (existing.ledgerEntryId) return false;

    const netPnl = BigInt(existing.netRealisedPnl);
    if (netPnl === 0n) return false;

    const entryType = netPnl > 0n
      ? LedgerEntryType.REALISED_TRADE_PROFIT
      : LedgerEntryType.REALISED_TRADE_LOSS;

    const ledgerEntry = await this.ledgerRepo.save(
      this.ledgerRepo.create({
        userId,
        assessmentId: null,
        brokerConnectionId,
        entryType,
        currency,
        amount: existing.netRealisedPnl,
        sourceReference: existing.brokerTradeId,
        occurredAt: existing.closedAt,
        metadata: {
          brokerTradeId: existing.brokerTradeId,
          brokerReconciledTradeId: existing.id,
          instrument: existing.instrument,
          direction: existing.direction,
          runId,
          backfilled: true,
        },
      }),
    );

    await this.tradeRepo.update(existing.id, { ledgerEntryId: ledgerEntry.id });

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_FEE_LEDGER_ENTRY_CREATED_FROM_BROKER_TRADE,
      resourceType: 'PerformanceFeeLedgerEntry',
      resourceId: ledgerEntry.id,
      metadata: {
        userId,
        brokerConnectionId,
        brokerTradeId: existing.brokerTradeId,
        brokerReconciledTradeId: existing.id,
        entryType,
        amount: existing.netRealisedPnl,
        currency,
        backfilled: true,
      },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(
      `[Recon] Backfilled missing ledger entry for reconciled trade ${existing.id} ` +
        `(brokerTradeId=${brokerTradeId})`,
    );
    return true;
  }

  // ── Fee eligibility ─────────────────────────────────────────────────────────

  /**
   * A trade is fee-eligible only when ALL of the following conditions hold:
   * 1. The trade is from a LIVE_BROKER source (always true here — demo/paper excluded upstream).
   * 2. The user has an active subscription.
   * 3. The subscription plan has an active performance fee policy.
   * 4. netRealisedPnl is non-zero (zero P&L → no ledger entry needed).
   *
   * NOTE: The trade itself must already be normalised (closedAt in past,
   * valid P&L, non-empty brokerTradeId). Those checks are done in the normalizer.
   */
  private isFeeEligible(
    trade: NormalizedClosedTrade,
    context: FeeEligibilityContext,
  ): boolean {
    if (!context.hasActiveSubscription) return false;
    if (!context.hasPerformanceFeePolicy) return false;
    if (BigInt(trade.netRealisedPnl) === 0n) return false;
    return true;
  }

  private async loadFeeEligibilityContext(userId: string): Promise<FeeEligibilityContext> {
    const subscription = await this.subscriptionRepo.findOne({
      where: { userId, status: SubscriptionStatus.ACTIVE },
      order: { createdAt: 'DESC' },
    });

    if (!subscription) {
      return { hasActiveSubscription: false, hasPerformanceFeePolicy: false };
    }

    // Check for plan-specific or global performance fee policy
    const policy = await this.findApplicablePolicy(subscription.subscriptionPlanId);
    return {
      hasActiveSubscription: true,
      hasPerformanceFeePolicy: policy !== null,
    };
  }

  private async findApplicablePolicy(planId: string | null): Promise<PerformanceFeePolicy | null> {
    if (planId) {
      const planPolicy = await this.policyRepo.findOne({
        where: { planId, isActive: true },
      });
      if (planPolicy) return planPolicy;
    }
    const globalPolicy = await this.policyRepo.findOne({
      where: { planId: IsNull(), isActive: true },
    });
    return globalPolicy ?? null;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private validateTimeRange(fromTime: Date, toTime: Date): void {
    const now = new Date();

    if (fromTime >= toTime) {
      throw new BadRequestException('fromTime must be before toTime');
    }

    if (toTime > now) {
      throw new BadRequestException('toTime must not be in the future');
    }

    const windowMs = toTime.getTime() - fromTime.getTime();
    const maxMs = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (windowMs > maxMs) {
      throw new BadRequestException(
        `Reconciliation window exceeds maximum of ${MAX_WINDOW_DAYS} days`,
      );
    }
  }

  private async finaliseRun(
    runId: string,
    status: ReconciliationRunStatus,
    totalBrokerTradesSeen: number,
    newLedgerEntriesCreated: number,
    duplicateTradesSkipped: number,
    failedTrades: number,
    errorSummary: string | null,
  ): Promise<void> {
    await this.runRepo.update(runId, {
      status,
      completedAt: new Date(),
      totalBrokerTradesSeen,
      newLedgerEntriesCreated,
      duplicateTradesSkipped,
      failedTrades,
      errorSummary,
    });
  }
}

interface FeeEligibilityContext {
  hasActiveSubscription: boolean;
  hasPerformanceFeePolicy: boolean;
}
