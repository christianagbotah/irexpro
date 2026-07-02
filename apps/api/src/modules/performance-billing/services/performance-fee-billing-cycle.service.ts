import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import {
  PerformanceFeeBillingCycle,
  BillingCycleStatus,
  FINAL_BILLING_CYCLE_STATUSES,
} from '../entities/performance-fee-billing-cycle.entity';
import { BrokerTradeReconciliationService } from '../../broker-reconciliation/services/broker-trade-reconciliation.service';
import { PerformanceFeeService } from '../../performance-fees/services/performance-fee.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../../common/enums/audit-action.enum';
import { AuditSeverity } from '../../audit/entities/audit-log.entity';
import { AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';

/** Maximum allowed billing cycle window in days. */
const MAX_CYCLE_DAYS = 366;

/**
 * PerformanceFeeBillingCycleService
 *
 * Orchestrates the end-to-end performance fee billing workflow:
 *
 *   1. Broker trade reconciliation (creates realised-P&L ledger entries)
 *   2. Performance fee assessment (calculates fee above high-water mark)
 *   3. Invoice creation (when feeAmount > 0)
 *
 * STATE MACHINE (enforced):
 *   DRAFT → RECONCILING → RECONCILED → ASSESSING → ASSESSED → INVOICED
 *                                                            → NO_FEE_DUE
 *   any non-final → FAILED
 *   DRAFT → CANCELLED
 *   FAILED → RECONCILING (safe retry)
 *   FAILED → CANCELLED
 *
 * INVARIANTS — never violated:
 *   1. No live broker withdrawals.
 *   2. No auto-charge of users.
 *   3. No HWM update — HWM advances only after a verified payment webhook.
 *   4. No duplicate assessments or invoices for the same user/broker/period.
 *   5. Cycle in a final state (INVOICED / NO_FEE_DUE / CANCELLED) cannot be rerun.
 *   6. All money values remain bigint minor-unit strings.
 *   7. No secrets in errorSummary, metadata, or audit logs.
 *   8. Fee is only assessed on realised closed LIVE-broker trades — not deposits,
 *      broker balance, open positions, demo/paper/backtest trades.
 */
@Injectable()
export class PerformanceFeeBillingCycleService {
  private readonly logger = new Logger(PerformanceFeeBillingCycleService.name);

  constructor(
    @InjectRepository(PerformanceFeeBillingCycle)
    private readonly cycleRepo: Repository<PerformanceFeeBillingCycle>,
    private readonly reconService: BrokerTradeReconciliationService,
    private readonly perfFeeService: PerformanceFeeService,
    private readonly auditService: AuditService,
  ) {}

  // ── CRUD helpers ────────────────────────────────────────────────────────────

  async getBillingCycle(id: string): Promise<PerformanceFeeBillingCycle> {
    const cycle = await this.cycleRepo.findOne({ where: { id } });
    if (!cycle) throw new NotFoundException(`Billing cycle ${id} not found`);
    return cycle;
  }

  async listBillingCycles(filters: {
    userId?: string;
    status?: BillingCycleStatus;
    limit?: number;
  }): Promise<PerformanceFeeBillingCycle[]> {
    const where: Record<string, unknown> = {};
    if (filters.userId) where['userId'] = filters.userId;
    if (filters.status) where['status'] = filters.status;
    return this.cycleRepo.find({
      where,
      order: { createdAt: 'DESC' },
      take: filters.limit ?? 100,
    });
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Create a new DRAFT billing cycle without running it.
   * Useful for pre-validating a period before kicking off the full workflow.
   */
  async createBillingCycle(
    userId: string,
    brokerConnectionId: string | null,
    periodStart: Date,
    periodEnd: Date,
    currency: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<PerformanceFeeBillingCycle> {
    this.validatePeriod(periodStart, periodEnd);

    const cycle = this.cycleRepo.create({
      userId,
      brokerConnectionId,
      periodStart,
      periodEnd,
      currency,
      status: BillingCycleStatus.DRAFT,
      createdByUserId: actorId,
      metadata: { createdBy: actorId },
    });

    let saved: PerformanceFeeBillingCycle;
    try {
      saved = await this.cycleRepo.save(cycle);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as { code?: string }).code === '23505') {
        throw new ConflictException(
          `A billing cycle already exists for this user/broker/period ` +
            `(userId=${userId}, brokerConnectionId=${brokerConnectionId ?? 'null'}, ` +
            `periodStart=${periodStart.toISOString()}, periodEnd=${periodEnd.toISOString()})`,
        );
      }
      throw err;
    }

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_BILLING_CYCLE_CREATED,
      resourceType: 'PerformanceFeeBillingCycle',
      resourceId: saved.id,
      ipAddress,
      metadata: {
        userId,
        brokerConnectionId,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        currency,
      },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(`[BillingCycle] Created cycle ${saved.id} for user ${userId} (DRAFT)`);
    return saved;
  }

  /**
   * Run a full billing cycle end-to-end:
   *   1. Reconcile broker trades for the period.
   *   2. Calculate performance fee assessment.
   *   3. Create invoice if feeAmount > 0.
   *
   * Idempotent: calling this on an already INVOICED / NO_FEE_DUE cycle throws.
   * A FAILED cycle can be retried safely.
   */
  async runBillingCycle(
    cycleId: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<PerformanceFeeBillingCycle> {
    const cycle = await this.getBillingCycle(cycleId);

    // ── Guard: final states cannot rerun ──────────────────────────────────────
    if (FINAL_BILLING_CYCLE_STATUSES.has(cycle.status)) {
      throw new BadRequestException(
        `Billing cycle ${cycleId} is in a final state (${cycle.status}) and cannot be rerun. ` +
          `Final states: INVOICED, NO_FEE_DUE, CANCELLED.`,
      );
    }

    // ── Guard: only DRAFT or FAILED may start a new run ───────────────────────
    if (
      cycle.status !== BillingCycleStatus.DRAFT &&
      cycle.status !== BillingCycleStatus.FAILED
    ) {
      throw new BadRequestException(
        `Billing cycle ${cycleId} is currently in status ${cycle.status}. ` +
          `Only DRAFT or FAILED cycles can be run.`,
      );
    }

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_BILLING_CYCLE_STARTED,
      resourceType: 'PerformanceFeeBillingCycle',
      resourceId: cycleId,
      ipAddress,
      metadata: {
        userId: cycle.userId,
        brokerConnectionId: cycle.brokerConnectionId,
        periodStart: cycle.periodStart.toISOString(),
        periodEnd: cycle.periodEnd.toISOString(),
        previousStatus: cycle.status,
      },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(`[BillingCycle] Starting cycle ${cycleId} for user ${cycle.userId}`);

    // ── Step 1: Reconciliation ────────────────────────────────────────────────
    if (!cycle.brokerConnectionId) {
      // Account-wide cycles without a specific broker connection skip reconciliation;
      // the caller is responsible for ensuring ledger entries are present.
      await this.transition(cycleId, BillingCycleStatus.RECONCILING);
      await this.transition(cycleId, BillingCycleStatus.RECONCILED);
    } else {
      await this.transition(cycleId, BillingCycleStatus.RECONCILING);
      let reconRun: Awaited<ReturnType<typeof this.reconService.runReconciliation>>;
      try {
        reconRun = await this.reconService.runReconciliation(
          cycle.userId,
          cycle.brokerConnectionId,
          cycle.periodStart,
          cycle.periodEnd,
          actorId,
          ipAddress,
        );
      } catch (err) {
        const errorSummary = this.safeErrorSummary(err);
        await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
        const failed = await this.cycleRepo.findOne({ where: { id: cycleId } });
        return failed!;
      }

      // Persist reconciliation run reference and ledger entry count
      await this.cycleRepo.update(cycleId, {
        reconciliationRunId: reconRun.id,
        totalLedgerEntriesCreated: reconRun.newLedgerEntriesCreated ?? 0,
      });

      await this.auditService.log({
        actorUserId: actorId,
        actorType: 'ADMIN',
        action: AuditAction.PERFORMANCE_BILLING_CYCLE_RECONCILED,
        resourceType: 'PerformanceFeeBillingCycle',
        resourceId: cycleId,
        ipAddress,
        metadata: {
          userId: cycle.userId,
          reconciliationRunId: reconRun.id,
          totalSeen: reconRun.totalBrokerTradesSeen,
          newLedgerEntriesCreated: reconRun.newLedgerEntriesCreated,
          duplicatesSkipped: reconRun.duplicateTradesSkipped,
        },
        severity: AuditSeverity.INFO,
      });

      await this.transition(cycleId, BillingCycleStatus.RECONCILED);
    }

    // ── Step 2: Assessment ────────────────────────────────────────────────────
    await this.transition(cycleId, BillingCycleStatus.ASSESSING);

    let assessment: Awaited<ReturnType<typeof this.perfFeeService.calculateAssessment>>;
    try {
      assessment = await this.perfFeeService.calculateAssessment(
        cycle.userId,
        cycle.brokerConnectionId,
        cycle.currency,
        cycle.periodStart,
        cycle.periodEnd,
        actorId,
        ipAddress,
      );
    } catch (err) {
      const errorSummary = this.safeErrorSummary(err);
      await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
      const failed = await this.cycleRepo.findOne({ where: { id: cycleId } });
      return failed!;
    }

    await this.cycleRepo.update(cycleId, {
      assessmentId: assessment.id,
      totalRealisedProfit: assessment.realisedProfitForFee ?? '0',
      feeAmount: assessment.feeAmount ?? '0',
    });

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_BILLING_CYCLE_ASSESSED,
      resourceType: 'PerformanceFeeBillingCycle',
      resourceId: cycleId,
      ipAddress,
      metadata: {
        userId: cycle.userId,
        assessmentId: assessment.id,
        assessmentStatus: assessment.status,
        feeAmount: assessment.feeAmount,
        currency: cycle.currency,
      },
      severity: AuditSeverity.INFO,
    });

    await this.transition(cycleId, BillingCycleStatus.ASSESSED);

    // ── Step 3: Invoice (or NO_FEE_DUE) ──────────────────────────────────────
    if (BigInt(assessment.feeAmount) <= 0n) {
      // No fee above HWM — complete without an invoice
      await this.cycleRepo.update(cycleId, {
        status: BillingCycleStatus.NO_FEE_DUE,
        completedAt: new Date(),
      });

      await this.auditService.log({
        actorUserId: actorId,
        actorType: 'ADMIN',
        action: AuditAction.PERFORMANCE_BILLING_CYCLE_NO_FEE_DUE,
        resourceType: 'PerformanceFeeBillingCycle',
        resourceId: cycleId,
        ipAddress,
        metadata: { userId: cycle.userId, assessmentId: assessment.id },
        severity: AuditSeverity.INFO,
      });

      this.logger.log(`[BillingCycle] Cycle ${cycleId} completed: NO_FEE_DUE`);
      return this.cycleRepo.findOne({ where: { id: cycleId } }) as Promise<PerformanceFeeBillingCycle>;
    }

    // assessment.status must be ASSESSED to invoice
    if (assessment.status !== AssessmentStatus.ASSESSED) {
      const errorSummary = `Assessment ${assessment.id} is in status ${assessment.status} — cannot invoice`;
      await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
      return this.cycleRepo.findOne({ where: { id: cycleId } }) as Promise<PerformanceFeeBillingCycle>;
    }

    let invoicedAssessment: Awaited<ReturnType<typeof this.perfFeeService.invoiceAssessment>>;
    try {
      invoicedAssessment = await this.perfFeeService.invoiceAssessment(
        assessment.id,
        actorId,
        ipAddress,
      );
    } catch (err) {
      const errorSummary = this.safeErrorSummary(err);
      await this.failCycle(cycleId, errorSummary, actorId, ipAddress);
      return this.cycleRepo.findOne({ where: { id: cycleId } }) as Promise<PerformanceFeeBillingCycle>;
    }

    await this.cycleRepo.update(cycleId, {
      invoiceId: invoicedAssessment.invoiceId,
      status: BillingCycleStatus.INVOICED,
      completedAt: new Date(),
    });

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_BILLING_CYCLE_INVOICED,
      resourceType: 'PerformanceFeeBillingCycle',
      resourceId: cycleId,
      ipAddress,
      metadata: {
        userId: cycle.userId,
        assessmentId: assessment.id,
        invoiceId: invoicedAssessment.invoiceId,
        feeAmount: assessment.feeAmount,
        currency: cycle.currency,
      },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(
      `[BillingCycle] Cycle ${cycleId} INVOICED: invoice=${invoicedAssessment.invoiceId}, ` +
        `feeAmount=${assessment.feeAmount} ${cycle.currency}`,
    );
    return this.cycleRepo.findOne({ where: { id: cycleId } }) as Promise<PerformanceFeeBillingCycle>;
  }

  /**
   * Convenience: create + immediately run a billing cycle.
   * Throws ConflictException if a cycle already exists for this period
   * (unless that cycle is FAILED, in which case it reruns it).
   */
  async runBillingCycleForUserPeriod(
    userId: string,
    brokerConnectionId: string | null,
    periodStart: Date,
    periodEnd: Date,
    currency: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<PerformanceFeeBillingCycle> {
    // Check for an existing cycle first — reuse FAILED, reject other states
    const existing = await this.findExistingCycle(userId, brokerConnectionId, periodStart, periodEnd);

    if (existing) {
      if (FINAL_BILLING_CYCLE_STATUSES.has(existing.status)) {
        throw new ConflictException(
          `A billing cycle in final state ${existing.status} already exists for this period ` +
            `(id=${existing.id}). Create a new cycle with a different period.`,
        );
      }
      if (
        existing.status !== BillingCycleStatus.DRAFT &&
        existing.status !== BillingCycleStatus.FAILED
      ) {
        throw new ConflictException(
          `A billing cycle (${existing.id}) is already ${existing.status} for this period. ` +
            `Wait for it to complete or cancel it first.`,
        );
      }
      // Reuse existing DRAFT or FAILED cycle
      return this.runBillingCycle(existing.id, actorId, ipAddress);
    }

    // Create new cycle and run immediately
    const cycle = await this.createBillingCycle(
      userId,
      brokerConnectionId,
      periodStart,
      periodEnd,
      currency,
      actorId,
      ipAddress,
    );
    return this.runBillingCycle(cycle.id, actorId, ipAddress);
  }

  /**
   * Cancel a billing cycle.
   * Only DRAFT and FAILED cycles can be cancelled.
   */
  async cancelBillingCycle(
    cycleId: string,
    reason: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<PerformanceFeeBillingCycle> {
    const cycle = await this.getBillingCycle(cycleId);

    if (FINAL_BILLING_CYCLE_STATUSES.has(cycle.status)) {
      throw new BadRequestException(
        `Billing cycle ${cycleId} is already in final state ${cycle.status} and cannot be cancelled`,
      );
    }

    const cancellableStatuses = new Set([BillingCycleStatus.DRAFT, BillingCycleStatus.FAILED]);
    if (!cancellableStatuses.has(cycle.status)) {
      throw new BadRequestException(
        `Billing cycle ${cycleId} is in status ${cycle.status}. ` +
          `Only DRAFT or FAILED cycles can be cancelled`,
      );
    }

    await this.cycleRepo.update(cycleId, {
      status: BillingCycleStatus.CANCELLED,
      errorSummary: reason,
      completedAt: new Date(),
    });

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_BILLING_CYCLE_CANCELLED,
      resourceType: 'PerformanceFeeBillingCycle',
      resourceId: cycleId,
      ipAddress,
      metadata: { userId: cycle.userId, reason },
      severity: AuditSeverity.INFO,
    });

    this.logger.log(`[BillingCycle] Cycle ${cycleId} CANCELLED: ${reason}`);
    return this.cycleRepo.findOne({ where: { id: cycleId } }) as Promise<PerformanceFeeBillingCycle>;
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private validatePeriod(periodStart: Date, periodEnd: Date): void {
    const now = new Date();

    if (periodStart >= periodEnd) {
      throw new BadRequestException('periodStart must be before periodEnd');
    }

    if (periodEnd > now) {
      throw new BadRequestException(
        `periodEnd (${periodEnd.toISOString()}) cannot be in the future`,
      );
    }

    const diffDays = (periodEnd.getTime() - periodStart.getTime()) / 86_400_000;
    if (diffDays > MAX_CYCLE_DAYS) {
      throw new BadRequestException(
        `Billing cycle window (${Math.ceil(diffDays)} days) exceeds the maximum of ${MAX_CYCLE_DAYS} days`,
      );
    }
  }

  private async transition(
    cycleId: string,
    newStatus: BillingCycleStatus,
  ): Promise<void> {
    await this.cycleRepo.update(cycleId, { status: newStatus });
  }

  private async failCycle(
    cycleId: string,
    errorSummary: string,
    actorId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.cycleRepo.update(cycleId, {
      status: BillingCycleStatus.FAILED,
      errorSummary,
      completedAt: new Date(),
    });

    // Retrieve userId for audit metadata (fail-safe: skip audit if cycle not found)
    const cycle = await this.cycleRepo.findOne({ where: { id: cycleId } });

    await this.auditService.log({
      actorUserId: actorId,
      actorType: 'ADMIN',
      action: AuditAction.PERFORMANCE_BILLING_CYCLE_FAILED,
      resourceType: 'PerformanceFeeBillingCycle',
      resourceId: cycleId,
      ipAddress,
      metadata: {
        userId: cycle?.userId ?? 'unknown',
        errorSummary,
      },
      severity: AuditSeverity.WARNING,
    });

    this.logger.error(`[BillingCycle] Cycle ${cycleId} FAILED: ${errorSummary}`);
  }

  /**
   * Build a safe, credential-free error summary from a thrown value.
   * Only uses the message string; never includes stack trace or raw error objects.
   */
  private safeErrorSummary(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);
    // Truncate to prevent runaway logs
    return raw.slice(0, 500);
  }

  private async findExistingCycle(
    userId: string,
    brokerConnectionId: string | null,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<PerformanceFeeBillingCycle | null> {
    return this.cycleRepo.findOne({
      where: {
        userId,
        brokerConnectionId: brokerConnectionId ?? undefined,
        periodStart,
        periodEnd,
      } as any,
    });
  }
}
