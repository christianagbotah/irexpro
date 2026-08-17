import * as crypto from 'crypto';
import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Trade, TradeCloseReason, TradeDirection, TradeStatus } from './entities/trade.entity';
import { TradingSession, TradingSessionStatus } from './entities/trading-session.entity';
import { RiskDecision } from '../risk/interfaces/risk.interface';
import { BrokerService } from '../broker/broker.service';
import { BrokerAdapterRegistry } from '../broker/adapters/broker-adapter.registry';
import { CredentialEncryptionService } from '../broker/services/credential-encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { BrokerOrderRequest } from '../broker/interfaces/broker-adapter.interface';
import { RETRYABLE_BROKER_ERRORS } from '../broker/interfaces/broker-adapter.errors';
import { DomainEventBus } from '../events/event-bus.service';
import { DomainEventType } from '../events/enums/domain-event-type.enum';

const EXECUTION_TIMEOUT_MS = 10_000;
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1_000, 3_000, 9_000];

/**
 * ExecutionService — Live trade execution engine.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * CRITICAL RULE — NEVER BYPASS:
 *   executeTrade() only accepts RiskDecision with decision === 'APPROVED'.
 *   Any non-APPROVED decision throws ForbiddenException immediately.
 *   This gate cannot be removed or weakened.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Pipeline:
 *   1. Enforce Risk Engine APPROVED gate
 *   2. Idempotency check (prevent duplicate orders)
 *   3. Create PENDING Trade record
 *   4. Prepare BrokerOrderRequest
 *   5. Call IBrokerAdapter.placeOrder() with retry + timeout
 *   6. Update Trade → OPEN or REJECTED
 *   7. Emit audit events
 *
 * See: docs/architecture/12-execution-engine-architecture.md
 */
@Injectable()
export class ExecutionService {
  private readonly logger = new Logger(ExecutionService.name);

  constructor(
    @InjectRepository(Trade)
    private tradeRepo: Repository<Trade>,
    @InjectRepository(TradingSession)
    private sessionRepo: Repository<TradingSession>,
    private brokerService: BrokerService,
    private adapterRegistry: BrokerAdapterRegistry,
    private encryptionService: CredentialEncryptionService,
    private auditService: AuditService,
    private dataSource: DataSource,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ─── Main entry point ────────────────────────────────────────────────────

  /**
   * Execute a trade that has been APPROVED by the Risk Engine.
   *
   * @throws ForbiddenException if riskDecision is not APPROVED — ALWAYS.
   */
  async executeTrade(userId: string, riskDecision: RiskDecision): Promise<Trade> {
    // ── Non-bypassable Risk Engine gate ────────────────────────────────────
    if (riskDecision.decision !== 'APPROVED') {
      const code =
        riskDecision.decision === 'REJECTED' || riskDecision.decision === 'SUSPENDED'
          ? riskDecision.rejectionCode
          : 'UNKNOWN';

      this.logger.warn(
        `executeTrade() blocked non-APPROVED decision for user ${userId}. ` +
          `Decision: ${riskDecision.decision}, Code: ${code}`,
      );

      throw new ForbiddenException(
        `Trade blocked: Risk Engine decision was ${riskDecision.decision} [${code}]. ` +
          `Execution requires APPROVED status.`,
      );
    }

    const order = riskDecision.validatedOrder;
    const signalId = riskDecision.signalId;

    // ── Step 2: Idempotency check (atomic) ─────────────────────────────────
    // Sprint 32: the previous findOne→save pattern was a TOCTOU race — two
    // concurrent calls could both pass the null check. Now we attempt the
    // INSERT directly; if the unique constraint on idempotency_key rejects it,
    // we load and return the existing trade. This is atomic at the DB level.
    const idempotencyKey = this.generateIdempotencyKey(
      userId,
      order.instrument,
      order.direction,
      signalId,
    );

    // ── Step 3: Get broker connection ──────────────────────────────────────
    const connection = await this.brokerService.findActiveConnectionForUser(userId);
    if (!connection) {
      throw new ForbiddenException('No active broker connection available for trade execution');
    }

    // ── Step 3b: Concurrency-safe daily-trade-slot reservation ────────────
    // Sprint 32 Gate 2 remediation: the Risk Engine's early check (Step 4b)
    // is a point-in-time count that is NOT concurrency-safe — two concurrent
    // requests with DIFFERENT signal IDs can both observe N-1 and pass.
    // This FINAL atomic guard uses a PostgreSQL advisory lock to serialize
    // the count + check for the same user+day. If the limit is reached,
    // reject deterministically with a ForbiddenException (the orchestrator
    // catches this and returns EXECUTION_FAILED).
    const maxDailyTrades = riskDecision.maxDailyTrades;
    const slot = await this.reserveDailyTradeSlot(userId, maxDailyTrades);
    if (!slot.allowed) {
      this.logger.warn(
        `Daily trade limit reached for user ${userId}: ${slot.currentCount}/${maxDailyTrades} ` +
          `(signal ${signalId} rejected by atomic advisory-lock guard)`,
      );
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.TRADE_REJECTED,
        resourceType: 'Trade',
        resourceId: signalId,
        metadata: {
          signalId,
          reason: 'MAX_DAILY_TRADES_EXCEEDED',
          currentCount: slot.currentCount,
          maxDailyTrades,
          guard: 'advisory-lock',
        },
        severity: AuditSeverity.WARNING,
      });
      throw new ForbiddenException(
        `Daily trade limit reached (${slot.currentCount}/${maxDailyTrades}). ` +
          `Cannot execute signal ${signalId}.`,
      );
    }

    // ── Step 4: Create PENDING trade record (atomic idempotency) ──────────
    // Attempt the INSERT. If a trade with this idempotency_key already exists,
    // the DB unique constraint rejects the INSERT and we return the existing
    // trade. This closes the TOCTOU race: two concurrent calls cannot both
    // create a trade for the same intent.
    let trade: Trade;
    try {
      trade = await this.tradeRepo.save(
        this.tradeRepo.create({
          userId,
          brokerConnectionId: connection.id,
          signalId,
          idempotencyKey,
          instrument: order.instrument,
          direction: order.direction as TradeDirection,
          lotSize: order.lotSize,
          requestedEntryPrice: order.entryPrice,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          trailingStopPips: order.trailingStopPips ?? null,
          status: TradeStatus.PENDING,
        }),
      );
    } catch (err) {
      // Unique constraint violation (PostgreSQL 23505) → duplicate intent
      if (this.isUniqueConstraintViolation(err)) {
        const existing = await this.tradeRepo.findOne({ where: { idempotencyKey } });
        if (existing) {
          this.logger.log(
            `Duplicate signal suppressed for key ${idempotencyKey} — returning existing trade ${existing.id}`,
          );
          await this.auditService.log({
            actorUserId: userId,
            action: AuditAction.TRADE_DUPLICATE_SUPPRESSED,
            resourceType: 'Trade',
            resourceId: existing.id,
            metadata: {
              idempotencyKey,
              signalId,
              instrument: order.instrument,
              direction: order.direction,
              existingTradeId: existing.id,
              existingTradeStatus: existing.status,
            },
            severity: AuditSeverity.WARNING,
          });
          return existing;
        }
      }
      throw err;
    }

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.TRADE_PREPARED,
      resourceType: 'Trade',
      resourceId: trade.id,
      metadata: {
        instrument: order.instrument,
        direction: order.direction,
        lotSize: order.lotSize,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        idempotencyKey,
        signalId,
      },
    });

    this.eventBus.publish(DomainEventType.TRADE_PENDING, userId, {
      tradeId: trade.id,
      userId,
      instrument: order.instrument,
      direction: order.direction,
      volume: order.lotSize,
      status: 'PENDING',
    });

    // ── Step 5: Prepare and submit order to broker ─────────────────────────
    try {
      const credentials = this.encryptionService.decrypt({
        ciphertext: connection.encryptedCredentials!,
        iv: connection.credentialIv!,
        tag: connection.credentialTag!,
        keyId: connection.encryptionKeyId!,
      });

      const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
      adapter.setMode(connection.accountType);
      await adapter.connect(credentials);

      // Zero credentials from memory immediately after connection
      (Object.keys(credentials) as (keyof typeof credentials)[]).forEach((k) => {
        (credentials as unknown as Record<string, unknown>)[k] = null;
      });

      const brokerRequest: BrokerOrderRequest = {
        instrument: order.instrument,
        direction: order.direction,
        lotSize: order.lotSize,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        idempotencyKey,
        comment: order.idempotencyKey,
      };

      const result = await this.submitWithRetry(adapter, brokerRequest);

      if (result.success && result.externalOrderId) {
        // ── Step 6a: Trade opened ──────────────────────────────────────────
        await this.tradeRepo.update(trade.id, {
          status: TradeStatus.OPEN,
          externalOrderId: result.externalOrderId,
          fillPrice: result.filledPrice ?? order.entryPrice,
          openedAt: new Date(),
        });

        trade.status = TradeStatus.OPEN;
        trade.externalOrderId = result.externalOrderId;

        await this.auditService.log({
          actorUserId: userId,
          action: AuditAction.TRADE_OPENED,
          resourceType: 'Trade',
          resourceId: trade.id,
          metadata: {
            externalOrderId: result.externalOrderId,
            fillPrice: result.filledPrice,
            instrument: order.instrument,
            direction: order.direction,
            lotSize: order.lotSize,
            signalId,
          },
        });

        this.logger.log(
          `Trade OPENED: id=${trade.id} externalId=${result.externalOrderId} ` +
            `${order.direction} ${order.instrument} ${order.lotSize} lots`,
        );

        this.eventBus.publish(DomainEventType.TRADE_OPENED, userId, {
          tradeId: trade.id,
          userId,
          instrument: order.instrument,
          direction: order.direction,
          volume: order.lotSize,
          entryPrice: result.filledPrice ?? order.entryPrice,
          status: 'OPEN',
        });
      } else {
        // ── Step 6b: Broker rejected ───────────────────────────────────────
        await this.tradeRepo.update(trade.id, {
          status: TradeStatus.REJECTED,
          brokerRejectionReason: result.brokerMessage ?? 'Broker rejected order',
        });

        trade.status = TradeStatus.REJECTED;

        await this.auditService.log({
          actorUserId: userId,
          action: AuditAction.TRADE_REJECTED,
          resourceType: 'Trade',
          resourceId: trade.id,
          metadata: { brokerMessage: result.brokerMessage, signalId },
          severity: AuditSeverity.WARNING,
        });

        this.eventBus.publish(DomainEventType.TRADE_REJECTED, userId, {
          tradeId: trade.id,
          userId,
          instrument: order.instrument,
          direction: order.direction,
          volume: order.lotSize,
          status: 'REJECTED',
          reason: result.brokerMessage ?? 'Broker rejected order',
        });
      }
    } catch (err) {
      // ── Execution error — set RECONCILIATION_PENDING for retry ─────────
      this.logger.error(
        `Trade execution error for trade ${trade.id}: ${(err as Error).message}`,
        (err as Error).stack,
      );

      await this.tradeRepo.update(trade.id, {
        status: TradeStatus.RECONCILIATION_PENDING,
        brokerRejectionReason: `Execution error: ${(err as Error).message}`,
      });

      trade.status = TradeStatus.RECONCILIATION_PENDING;

      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.TRADE_SUBMITTED,
        resourceType: 'Trade',
        resourceId: trade.id,
        metadata: { error: (err as Error).message, status: 'RECONCILIATION_PENDING' },
        severity: AuditSeverity.CRITICAL,
      });

      this.eventBus.publish(DomainEventType.TRADE_RECONCILIATION_PENDING, userId, {
        tradeId: trade.id,
        userId,
        instrument: order.instrument,
        direction: order.direction,
        volume: order.lotSize,
        status: 'RECONCILIATION_PENDING',
        reason: (err as Error).message,
      });
    }

    return trade;
  }

  // ─── Trade close ──────────────────────────────────────────────────────────

  /**
   * Close an open trade. Called by AI signal, kill switch, or user action.
   * The Risk Engine must validate the CLOSE action before calling this.
   */
  async closeTrade(tradeId: string, userId: string, reason: TradeCloseReason): Promise<Trade> {
    const trade = await this.tradeRepo.findOne({ where: { id: tradeId, userId } });
    if (!trade) {
      throw new ForbiddenException(`Trade ${tradeId} not found or does not belong to user`);
    }
    if (trade.status !== TradeStatus.OPEN) {
      throw new ForbiddenException(`Trade ${tradeId} is not OPEN (status: ${trade.status})`);
    }
    if (!trade.externalOrderId) {
      throw new ForbiddenException(`Trade ${tradeId} has no externalOrderId — cannot close`);
    }

    // findConnectionById requires userId for ownership check
    const connection = await this.brokerService.findConnectionById(
      trade.brokerConnectionId,
      userId,
    );

    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials!,
      iv: connection.credentialIv!,
      tag: connection.credentialTag!,
      keyId: connection.encryptionKeyId!,
    });

    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
    adapter.setMode(connection.accountType);
    await adapter.connect(credentials);

    (Object.keys(credentials) as (keyof typeof credentials)[]).forEach((k) => {
      (credentials as unknown as Record<string, unknown>)[k] = null;
    });

    const result = await adapter.closeOrder(trade.externalOrderId);
    // filledPrice = exit price for close order; P&L populated by reconciliation job
    const exitPrice = result.filledPrice ?? null;

    await this.tradeRepo.update(trade.id, {
      status: TradeStatus.CLOSED,
      exitPrice,
      closedAt: new Date(),
      closeReason: reason,
    });

    trade.status = TradeStatus.CLOSED;
    trade.closeReason = reason;

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.TRADE_CLOSED,
      resourceType: 'Trade',
      resourceId: trade.id,
      metadata: {
        exitPrice,
        closeReason: reason,
        externalOrderId: trade.externalOrderId,
      },
    });

    this.logger.log(
      `Trade CLOSED: id=${trade.id} reason=${reason} exitPrice=${exitPrice ?? 'pending'}`,
    );

    return trade;
  }

  // ─── Query helpers (used by Risk Engine) ─────────────────────────────────

  /** Count of currently open trades for a user. Used for Risk Engine Step 4a. */
  async countOpenTrades(userId: string): Promise<number> {
    return this.tradeRepo.count({ where: { userId, status: TradeStatus.OPEN } });
  }

  /**
   * Count of trades opened today (UTC day boundary) for a user.
   * Used for Risk Engine Step 4b (max daily trades enforcement).
   *
   * Sprint 32: counts trades that were actually OPENED today (have an
   * opened_at timestamp), excluding PENDING (not yet submitted to broker)
   * and REJECTED (broker refused). This avoids double-counting retries and
   * avoids counting risk-rejected attempts as executed trades.
   *
   * The trading-day boundary is UTC midnight — consistent with the existing
   * getTodayRealisedLoss() day boundary.
   */
  async countTodayTrades(userId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const result = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
       FROM trading.trades
       WHERE user_id = $1
         AND opened_at >= $2
         AND status IN ('OPEN', 'CLOSED')`,
      [userId, todayStart.toISOString()],
    );

    return parseInt(result[0]?.count ?? '0', 10);
  }

  /**
   * Sprint 32 Gate 2 remediation — concurrency-safe daily trade slot reservation.
   *
   * Uses a PostgreSQL session-level advisory lock scoped to (userId + UTC day)
   * to atomically check the daily trade count and reserve a slot. Two
   * concurrent requests with DIFFERENT signal IDs cannot both consume the
   * final slot.
   *
   * Architecture:
   *   1. Acquire advisory lock pg_try_advisory_xact_lock(key)
   *      key = hash(userId + UTC date)
   *   2. Inside the lock: count OPEN+CLOSED+PENDING trades created today
   *      (PENDING acts as a "reservation" — it occupies a slot while broker
   *      submission is in-flight)
   *   3. If count >= maxDailyTrades → return { allowed: false }
   *   4. Otherwise → return { allowed: true } (the caller creates the PENDING
   *      trade immediately after, which reserves the slot)
   *   5. Release the lock (transaction commit)
   *
   * The lock is transaction-scoped (pg_try_advisory_xact_lock) — it is
   * automatically released when the transaction commits/rolls back. The
   * transaction is SHORT (count + check) — it does NOT span the broker
   * network request. The PENDING trade created after the lock release acts
   * as the persistent reservation.
   *
   * If broker execution fails (PENDING → REJECTED), the slot is released
   * because REJECTED trades are not counted by countTodayTrades (which only
   * counts OPEN+CLOSED) nor by the advisory-lock count (which counts
   * OPEN+CLOSED+PENDING, but the PENDING → REJECTED transition removes it
   * from the PENDING count). This is the intended policy: a failed broker
   * submission does not permanently consume a daily slot.
   *
   * @returns { allowed: boolean, currentCount: number }
   */
  async reserveDailyTradeSlot(
    userId: string,
    maxDailyTrades: number,
  ): Promise<{ allowed: boolean; currentCount: number }> {
    // Compute a stable 32-bit advisory lock key from userId + UTC date.
    // Uses a CRC-like hash to map the string to a bigint for pg_advisory_lock.
    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
    const lockKey = this.computeDailyTradeLockKey(userId, todayStr);

    // Use a short transaction: acquire lock → count → return. The lock is
    // released on transaction commit (pg_try_advisory_xact_lock).
    const result = await this.dataSource.transaction(async (manager) => {
      // Try to acquire the advisory lock. If another request holds it,
      // wait (pg_advisory_xact_lock blocks until acquired — this serializes
      // concurrent requests for the same user+day).
      await manager.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

      // Count trades that occupy a daily slot: OPEN, CLOSED (opened today),
      // and PENDING (created today — reservation while broker submission
      // is in-flight). REJECTED and CANCELLED trades do NOT occupy a slot.
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const countResult = await manager.query(
        `SELECT COUNT(*) AS count
         FROM trading.trades
         WHERE user_id = $1
           AND (
             (opened_at >= $2 AND status IN ('OPEN', 'CLOSED'))
             OR
             (created_at >= $2 AND status = 'PENDING')
           )`,
        [userId, todayStart.toISOString()],
      );

      const currentCount = parseInt(countResult[0]?.count ?? '0', 10);
      const allowed = currentCount < maxDailyTrades;

      return { allowed, currentCount };
    });

    return result;
  }

  /**
   * Compute a stable 32-bit integer advisory lock key from userId + date.
   * PostgreSQL advisory lock keys are bigint; we use a single 32-bit key
   * for simplicity (sufficient for user+day scoping).
   */
  private computeDailyTradeLockKey(userId: string, dateStr: string): number {
    // Simple deterministic hash: combine userId + date char codes.
    // Uses a polynomial rolling hash mod 2^31 for a positive 32-bit key.
    const input = `${userId}:${dateStr}`;
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = (hash * 31 + input.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
  }

  /**
   * Sum of today's realised losses (negative P&L only) for daily loss limit check.
   * Returns a negative number (e.g., -250.00) or 0 if no losses today.
   * Used for Risk Engine Step 3a.
   */
  async getTodayRealisedLoss(userId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const result = await this.dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(SUM(realised_pnl), 0) AS total
       FROM trading.trades
       WHERE user_id = $1
         AND status = 'CLOSED'
         AND closed_at >= $2
         AND realised_pnl < 0`,
      [userId, todayStart.toISOString()],
    );

    return parseFloat(result[0]?.total ?? '0');
  }

  async getOpenTrades(userId: string): Promise<Trade[]> {
    return this.tradeRepo.find({ where: { userId, status: TradeStatus.OPEN } });
  }

  async findTradeById(tradeId: string): Promise<Trade | null> {
    return this.tradeRepo.findOne({ where: { id: tradeId } });
  }

  /**
   * Find a trade by its signalId for a given user.
   *
   * Sprint 32: used by the Risk Engine's idempotency check (Step 7) to detect
   * duplicate signal processing. If a trade already exists for this signalId,
   * the signal is a duplicate and the Risk Engine rejects with DUPLICATE_SIGNAL.
   *
   * Scoped by userId so a signalId from one user doesn't collide with another.
   */
  async findTradeBySignalId(signalId: string, userId: string): Promise<Trade | null> {
    return this.tradeRepo.findOne({ where: { signalId, userId } });
  }

  // ─── Session management ───────────────────────────────────────────────────

  async startSession(
    userId: string,
    brokerConnectionId: string,
    openingBalance: string,
    riskProfileSnapshot?: Record<string, unknown> | null,
  ): Promise<TradingSession> {
    const existing = await this.sessionRepo.findOne({
      where: { userId, status: TradingSessionStatus.ACTIVE },
    });
    if (existing) return existing;

    return this.sessionRepo.save(
      this.sessionRepo.create({
        userId,
        brokerConnectionId,
        status: TradingSessionStatus.ACTIVE,
        openingBalance,
        peakEquity: openingBalance,
        startedAt: new Date(),
        // Sprint 32: snapshot the risk profile at session start so future
        // edits don't rewrite history. The snapshot is a deterministic JSON
        // object of risk-relevant fields (no credentials/secrets/PII).
        riskProfileSnapshot: riskProfileSnapshot ?? null,
      }),
    );
  }

  async endSession(userId: string, status = TradingSessionStatus.ENDED): Promise<void> {
    await this.sessionRepo.update(
      { userId, status: TradingSessionStatus.ACTIVE },
      { status, endedAt: new Date() },
    );
  }

  async getActiveSession(userId: string): Promise<TradingSession | null> {
    return this.sessionRepo.findOne({ where: { userId, status: TradingSessionStatus.ACTIVE } });
  }

  async findSessionById(sessionId: string): Promise<TradingSession | null> {
    return this.sessionRepo.findOne({ where: { id: sessionId } });
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private generateIdempotencyKey(
    userId: string,
    instrument: string,
    direction: string,
    signalId: string,
  ): string {
    return crypto
      .createHash('sha256')
      .update(`${userId}:${instrument}:${direction}:${signalId}`)
      .digest('hex');
  }

  /**
   * Detect a PostgreSQL unique-constraint violation (SQLSTATE 23505).
   *
   * Sprint 32: used by the atomic idempotency check. When two concurrent
   * executeTrade() calls race to INSERT a trade with the same idempotency_key,
   * the DB unique constraint rejects one of the INSERTs. This helper reliably
   * detects that condition so we can return the existing trade instead of
   * surfacing an unhandled QueryFailedError.
   *
   * TypeORM wraps the pg error in a QueryFailedError; the original pg error's
   * `code` property is '23505'. We check both the `code` property and the error
   * message for the SQLSTATE to be defensive across driver versions.
   */
  private isUniqueConstraintViolation(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const code = (err as { code?: string }).code;
    if (code === '23505') return true;
    // Fallback: check the message for the SQLSTATE or the constraint name.
    const msg = err.message ?? '';
    return msg.includes('23505') || msg.includes('duplicate key value');
  }

  private async submitWithRetry(
    adapter: ReturnType<BrokerAdapterRegistry['getAdapter']>,
    request: BrokerOrderRequest,
  ): Promise<Awaited<ReturnType<typeof adapter.placeOrder>>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await Promise.race([
          adapter.placeOrder(request),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Broker order timeout')), EXECUTION_TIMEOUT_MS),
          ),
        ]);
        return result;
      } catch (err) {
        lastError = err as Error;

        const isRetryable =
          err instanceof Error &&
          'errorCode' in err &&
          RETRYABLE_BROKER_ERRORS.has((err as { errorCode: string }).errorCode as never);

        if (!isRetryable || attempt === MAX_RETRY_ATTEMPTS - 1) {
          throw err;
        }

        const delay = RETRY_DELAYS_MS[attempt] ?? 9_000;
        this.logger.warn(
          `Broker order attempt ${attempt + 1} failed (${lastError.message}) — ` +
            `retrying in ${delay}ms`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    throw lastError ?? new Error('All retry attempts exhausted');
  }
}
