import * as crypto from 'crypto';
import {
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Trade, TradeCloseReason, TradeDirection, TradeStatus } from './entities/trade.entity';
import { TradingSession, TradingSessionStatus } from './entities/trading-session.entity';
import { RiskDecision, ValidatedOrder } from '../risk/interfaces/risk.interface';
import { BrokerService } from '../broker/broker.service';
import { BrokerAdapterRegistry } from '../broker/adapters/broker-adapter.registry';
import { CredentialEncryptionService } from '../broker/services/credential-encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { BrokerOrderRequest } from '../broker/interfaces/broker-adapter.interface';
import { RETRYABLE_BROKER_ERRORS } from '../broker/interfaces/broker-adapter.errors';

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

    // ── Step 2: Idempotency check ──────────────────────────────────────────
    const idempotencyKey = this.generateIdempotencyKey(
      userId,
      order.instrument,
      order.direction,
      signalId,
    );

    const existing = await this.tradeRepo.findOne({ where: { idempotencyKey } });
    if (existing) {
      this.logger.log(
        `Duplicate signal detected for key ${idempotencyKey} — returning existing trade ${existing.id}`,
      );
      return existing;
    }

    // ── Step 3: Get broker connection ──────────────────────────────────────
    const connection = await this.brokerService.findActiveConnectionForUser(userId);
    if (!connection) {
      throw new ForbiddenException('No active broker connection available for trade execution');
    }

    // ── Step 4: Create PENDING trade record ────────────────────────────────
    const trade = await this.tradeRepo.save(
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
    (Object.keys(credentials) as (keyof typeof credentials)[]).forEach(
      (k) => { (credentials as unknown as Record<string, unknown>)[k] = null; },
    );

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
    }

    return trade;
  }

  // ─── Trade close ──────────────────────────────────────────────────────────

  /**
   * Close an open trade. Called by AI signal, kill switch, or user action.
   * The Risk Engine must validate the CLOSE action before calling this.
   */
  async closeTrade(
    tradeId: string,
    userId: string,
    reason: TradeCloseReason,
  ): Promise<Trade> {
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
    const connection = await this.brokerService.findConnectionById(trade.brokerConnectionId, userId);

    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials!,
      iv: connection.credentialIv!,
      tag: connection.credentialTag!,
      keyId: connection.encryptionKeyId!,
    });

    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
    adapter.setMode(connection.accountType);
    await adapter.connect(credentials);

    (Object.keys(credentials) as (keyof typeof credentials)[]).forEach(
      (k) => { (credentials as unknown as Record<string, unknown>)[k] = null; },
    );

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

  // ─── Session management ───────────────────────────────────────────────────

  async startSession(userId: string, brokerConnectionId: string, openingBalance: string): Promise<TradingSession> {
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
