import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { isSupportedCurrency } from './currency-minor-units';
import {
  BrokerTradeReconciliationRun,
  ReconciliationRunStatus,
} from '../entities/broker-trade-reconciliation-run.entity';
import { BrokerReconciledTrade, TradeSourceType } from '../entities/broker-reconciled-trade.entity';
import {
  PerformanceFeeLedgerEntry,
  LedgerEntryType,
} from '../../performance-fees/entities/performance-fee-ledger-entry.entity';
import { BrokerService } from '../../broker/broker.service';
import { BrokerMode } from '../../broker/interfaces/broker-adapter.interface';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../../common/enums/audit-action.enum';
import { AuditSeverity } from '../../audit/entities/audit-log.entity';
import { ClosedTradeNormalizerService } from './closed-trade-normalizer.service';
import { NormalizedClosedTrade } from '../interfaces/normalized-closed-trade.interface';

const MAX_WINDOW_DAYS = 90;

function advisoryLockKey(...parts: string[]): string {
  const h = parts.join('|');
  let lo = 0x811c9dc5;
  let hi = 0x84222325;
  for (let i = 0; i < h.length; i++) {
    lo ^= h.charCodeAt(i);
    lo = Math.imul(lo, 0x01000193) >>> 0;
    hi ^= h.charCodeAt(i) + 1;
    hi = Math.imul(hi, 0x01000193) >>> 0;
  }
  const combined = BigInt.asIntN(53, (BigInt(hi) << 32n) | BigInt(lo));
  return combined.toString();
}

function validateAccountCurrency(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) {
    throw new BadRequestException(
      'Broker connection has no account currency configured. ' +
        'Reconciliation aborted — iRexPro never defaults to USD or any other currency.',
    );
  }
  const trimmed = String(raw).trim();
  if (trimmed === '') {
    throw new BadRequestException(
      'Broker connection account currency is empty. Reconciliation aborted.',
    );
  }
  if (!isSupportedCurrency(trimmed)) {
    throw new BadRequestException(
      `Unsupported account currency '${trimmed}' for minor-unit conversion.`,
    );
  }
  return trimmed.toUpperCase();
}

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
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly brokerService: BrokerService,
    private readonly normalizerService: ClosedTradeNormalizerService,
    private readonly auditService: AuditService,
  ) {}

  async getRuns(userId?: string): Promise<BrokerTradeReconciliationRun[]> {
    const where = userId ? { userId } : {};
    return this.runRepo.find({ where, order: { createdAt: 'DESC' }, take: 100 });
  }

  async getReconciledTrades(
    userId?: string,
    brokerConnectionId?: string,
  ): Promise<BrokerReconciledTrade[]> {
    const where: Record<string, unknown> = {};
    if (userId) where['userId'] = userId;
    if (brokerConnectionId) where['brokerConnectionId'] = brokerConnectionId;
    return this.tradeRepo.find({ where, order: { closedAt: 'DESC' }, take: 500 });
  }

  async runReconciliation(
    userId: string,
    brokerConnectionId: string,
    fromTime: Date,
    toTime: Date,
    actorId: string,
    ipAddress?: string,
  ): Promise<BrokerTradeReconciliationRun> {
    this.validateTimeRange(fromTime, toTime);
    const connection = await this.brokerService.findConnectionById(brokerConnectionId, userId);
    if (connection.accountType !== BrokerMode.LIVE) {
      throw new BadRequestException(
        `Broker connection ${brokerConnectionId} is not a LIVE account.`,
      );
    }
    const currency = validateAccountCurrency(connection.accountCurrency);

    const run = await this.runRepo.save(
      this.runRepo.create({
        userId,
        brokerConnectionId,
        status: ReconciliationRunStatus.PENDING,
        fromTime,
        toTime,
        metadata: { actorId, brokerProvider: connection.brokerId },
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

    await this.runRepo.update(run.id, {
      status: ReconciliationRunStatus.RUNNING,
      startedAt: new Date(),
    });

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
      this.logger.error(`[Recon] Run ${run.id} FAILED — adapter error: ${errorMsg}`);
      return this.runRepo.findOne({
        where: { id: run.id },
      }) as Promise<BrokerTradeReconciliationRun>;
    }

    const { valid: normalised, skipped } = this.normalizerService.normalize(
      rawTrades,
      connection.brokerId,
      currency,
    );

    let newLedgerEntriesCreated = 0;
    let duplicateTradesSkipped = 0;
    let failedTrades = 0;
    let hasWarnings = false;

    for (const trade of normalised) {
      try {
        const result = await this.processTradeAtomically(
          trade,
          userId,
          brokerConnectionId,
          connection.brokerId,
          run.id,
          currency,
          actorId,
        );
        if (result.isDuplicate) duplicateTradesSkipped++;
        else if (result.ledgerEntryCreated) newLedgerEntriesCreated++;
      } catch (err) {
        failedTrades++;
        hasWarnings = true;
        this.logger.warn(
          `[Recon] Run ${run.id} — trade ${trade.brokerTradeId} failed: ${(err as Error).message}`,
        );
      }
    }
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
      `[Recon] Run ${run.id} ${status}: seen=${totalSeen} new=${newLedgerEntriesCreated} dup=${duplicateTradesSkipped} failed=${failedTrades}`,
    );
    return this.runRepo.findOne({ where: { id: run.id } }) as Promise<BrokerTradeReconciliationRun>;
  }

  private async processTradeAtomically(
    trade: NormalizedClosedTrade,
    userId: string,
    brokerConnectionId: string,
    brokerProvider: string,
    runId: string,
    currency: string,
    actorId: string,
  ): Promise<{ isDuplicate: boolean; ledgerEntryCreated: boolean }> {
    const lockKey = advisoryLockKey(userId, brokerConnectionId, trade.brokerTradeId);
    const sourceType = TradeSourceType.LIVE_BROKER;
    const isFeeEligible = sourceType === TradeSourceType.LIVE_BROKER;
    const netPnl = BigInt(trade.netRealisedPnl);
    const postCommitAudits: Array<() => Promise<void>> = [];

    const result = await this.dataSource.transaction(async (tx: EntityManager) => {
      await tx.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);
      const tradeRepo = tx.getRepository(BrokerReconciledTrade);
      const ledgerRepo = tx.getRepository(PerformanceFeeLedgerEntry);

      const existing = await tradeRepo.findOne({
        where: { userId, brokerConnectionId, brokerTradeId: trade.brokerTradeId },
      });

      if (existing) {
        // Historical rows must never be silently relabelled if the broker account
        // currency no longer matches the currency captured on the trade.
        if (existing.currency !== currency) {
          throw new BadRequestException(
            `Existing reconciled trade currency '${existing.currency}' does not match ` +
              `authoritative broker account currency '${currency}' for trade ${trade.brokerTradeId}.`,
          );
        }

        if (BigInt(existing.netRealisedPnl) === 0n) {
          postCommitAudits.push(() =>
            this.auditDuplicate(actorId, userId, brokerConnectionId, trade.brokerTradeId),
          );
          return { isDuplicate: true, ledgerEntryCreated: false };
        }
        if (existing.ledgerEntryId) {
          postCommitAudits.push(() =>
            this.auditDuplicate(actorId, userId, brokerConnectionId, trade.brokerTradeId),
          );
          return { isDuplicate: true, ledgerEntryCreated: false };
        }

        const expectedEntryType =
          BigInt(existing.netRealisedPnl) > 0n
            ? LedgerEntryType.REALISED_TRADE_PROFIT
            : LedgerEntryType.REALISED_TRADE_LOSS;
        const candidateLedgers = await ledgerRepo.find({
          where: { userId, brokerConnectionId, sourceReference: trade.brokerTradeId },
        });

        if (candidateLedgers.length > 1) {
          throw new BadRequestException(
            `Ambiguous realised-P&L ledger state for broker trade ${trade.brokerTradeId}: ` +
              `${candidateLedgers.length} candidate ledgers found.`,
          );
        }

        if (candidateLedgers.length === 1) {
          const existingLedger = candidateLedgers[0];
          const amountMatches = BigInt(existingLedger.amount) === BigInt(existing.netRealisedPnl);
          if (
            existingLedger.entryType !== expectedEntryType ||
            existingLedger.currency !== currency ||
            !amountMatches
          ) {
            throw new BadRequestException(
              `Existing ledger for broker trade ${trade.brokerTradeId} does not match ` +
                'the expected realised-P&L type, currency, and amount; refusing unsafe linkage.',
            );
          }

          await tradeRepo.update(existing.id, { ledgerEntryId: existingLedger.id });
          postCommitAudits.push(() =>
            this.auditLink(
              actorId,
              userId,
              brokerConnectionId,
              trade.brokerTradeId,
              existing.id,
              existingLedger.id,
              existingLedger.entryType,
              existingLedger.amount,
              currency,
              true,
            ),
          );
          return { isDuplicate: false, ledgerEntryCreated: false };
        }

        const ledger = ledgerRepo.create({
          userId,
          assessmentId: null,
          brokerConnectionId,
          entryType: expectedEntryType,
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
        });
        const savedLedger = await ledgerRepo.save(ledger);
        await tradeRepo.update(existing.id, { ledgerEntryId: savedLedger.id });
        postCommitAudits.push(() =>
          this.auditLink(
            actorId,
            userId,
            brokerConnectionId,
            trade.brokerTradeId,
            existing.id,
            savedLedger.id,
            expectedEntryType,
            existing.netRealisedPnl,
            currency,
            false,
          ),
        );
        return { isDuplicate: false, ledgerEntryCreated: true };
      }

      const reconciledTrade = tradeRepo.create({
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
        sourceType,
        isFeeEligible,
      });
      const savedTrade = await tradeRepo.save(reconciledTrade);
      postCommitAudits.push(() =>
        this.auditReconciled(
          actorId,
          userId,
          brokerConnectionId,
          trade.brokerTradeId,
          savedTrade.id,
          trade.instrument,
          trade.direction,
          trade.netRealisedPnl,
          currency,
          isFeeEligible,
        ),
      );

      if (netPnl === 0n) return { isDuplicate: false, ledgerEntryCreated: false };

      const entryType =
        netPnl > 0n ? LedgerEntryType.REALISED_TRADE_PROFIT : LedgerEntryType.REALISED_TRADE_LOSS;
      const ledger = ledgerRepo.create({
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
          brokerReconciledTradeId: savedTrade.id,
          instrument: trade.instrument,
          direction: trade.direction,
          runId,
        },
      });
      const savedLedger = await ledgerRepo.save(ledger);
      await tradeRepo.update(savedTrade.id, { ledgerEntryId: savedLedger.id });
      postCommitAudits.push(() =>
        this.auditLink(
          actorId,
          userId,
          brokerConnectionId,
          trade.brokerTradeId,
          savedTrade.id,
          savedLedger.id,
          entryType,
          trade.netRealisedPnl,
          currency,
          false,
        ),
      );
      return { isDuplicate: false, ledgerEntryCreated: true };
    });

    // Audit persistence uses a separate repository. Execute it only after the
    // financial transaction commits so a rolled-back trade/ledger cannot leave
    // behind a misleading success/link audit record.
    for (const audit of postCommitAudits) {
      await audit();
    }

    return result;
  }

  private async auditDuplicate(
    actorId: string,
    userId: string,
    brokerConnectionId: string,
    brokerTradeId: string,
  ): Promise<void> {
    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.BROKER_TRADE_RECONCILIATION_SKIPPED,
      resourceType: 'BrokerReconciledTrade',
      resourceId: `${userId}/${brokerConnectionId}/${brokerTradeId}`,
      metadata: { userId, brokerConnectionId, brokerTradeId, reason: 'duplicate' },
      severity: AuditSeverity.INFO,
    });
  }

  private async auditReconciled(
    actorId: string,
    userId: string,
    brokerConnectionId: string,
    brokerTradeId: string,
    tradeId: string,
    instrument: string,
    direction: string,
    netRealisedPnl: string,
    currency: string,
    isFeeEligible: boolean,
  ): Promise<void> {
    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.BROKER_TRADE_RECONCILED,
      resourceType: 'BrokerReconciledTrade',
      resourceId: tradeId,
      metadata: {
        userId,
        brokerConnectionId,
        brokerTradeId,
        instrument,
        direction,
        netRealisedPnl,
        currency,
        isFeeEligible,
      },
      severity: AuditSeverity.INFO,
    });
  }

  private async auditLink(
    actorId: string,
    userId: string,
    brokerConnectionId: string,
    brokerTradeId: string,
    tradeId: string,
    ledgerId: string,
    entryType: LedgerEntryType,
    amount: string,
    currency: string,
    linkedExisting: boolean,
  ): Promise<void> {
    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_FEE_LEDGER_ENTRY_CREATED_FROM_BROKER_TRADE,
      resourceType: 'PerformanceFeeLedgerEntry',
      resourceId: ledgerId,
      metadata: {
        userId,
        brokerConnectionId,
        brokerTradeId,
        brokerReconciledTradeId: tradeId,
        entryType,
        amount,
        currency,
        linkedExisting,
      },
      severity: AuditSeverity.INFO,
    });
  }

  private validateTimeRange(fromTime: Date, toTime: Date): void {
    const now = new Date();
    if (fromTime >= toTime) throw new BadRequestException('fromTime must be before toTime');
    if (toTime > now) throw new BadRequestException('toTime must not be in the future');
    const windowMs = toTime.getTime() - fromTime.getTime();
    const maxMs = MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (windowMs > maxMs)
      throw new BadRequestException(
        `Reconciliation window exceeds maximum of ${MAX_WINDOW_DAYS} days`,
      );
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
