import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EmergencyShutdownEvent } from './entities/emergency-shutdown-event.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { Trade, TradeStatus } from '../execution/entities/trade.entity';

import { BrokerService } from '../broker/broker.service';
import { BrokerConnectionStatus } from '../broker/interfaces/broker-adapter.interface';
import { CredentialEncryptionService } from '../broker/services/credential-encryption.service';
import { BrokerAdapterRegistry } from '../broker/adapters/broker-adapter.registry';

/**
 * EmergencyShutdownService
 *
 * Platform-wide emergency shutdown — the master kill switch.
 *
 * When activated:
 * 1. ALL trading is halted (Risk Engine checks isActive() first)
 * 2. ALL open positions are force-closed via broker closeAllOrders
 * 3. The event is immutably audit-logged
 * 4. Only SUPER_ADMIN can activate or deactivate
 *
 * This is NOT a per-user kill switch. It affects every user, every broker,
 * every position on the entire platform.
 *
 * SAFETY: The service is idempotent — activating when already active is a
 * no-op (returns the existing event). Deactivating when inactive is rejected.
 */
@Injectable()
export class EmergencyShutdownService {
  private readonly logger = new Logger(EmergencyShutdownService.name);
  private cachedActiveEvent: EmergencyShutdownEvent | null = null;

  constructor(
    @InjectRepository(EmergencyShutdownEvent)
    private readonly eventRepo: Repository<EmergencyShutdownEvent>,
    private readonly dataSource: DataSource,
    private readonly auditService: AuditService,
    private readonly brokerService: BrokerService,
    private readonly encryptionService: CredentialEncryptionService,
    private readonly adapterRegistry: BrokerAdapterRegistry,
  ) {
    // Load active event on startup
    void this.loadActiveEvent();
  }

  private async loadActiveEvent(): Promise<void> {
    const event = await this.eventRepo.findOne({
      where: { isActive: true },
      order: { activatedAt: 'DESC' },
    });
    this.cachedActiveEvent = event;
    if (event) {
      this.logger.warn(
        `[EmergencyShutdown] Platform is in EMERGENCY SHUTDOWN since ${event.activatedAt.toISOString()} — reason: ${event.reason}`,
      );
    }
  }

  /**
   * Check if the platform is in emergency shutdown.
   * Uses an in-memory cache for hot-path performance (Risk Engine calls this
   * on every signal). The cache is populated on startup and updated on
   * activation/deactivation.
   */
  async isEmergencyShutdownActive(): Promise<boolean> {
    if (this.cachedActiveEvent) return true;
    // Fallback: query DB (in case cache is stale after a restart)
    const count = await this.eventRepo.count({ where: { isActive: true } });
    if (count > 0) {
      await this.loadActiveEvent();
      return true;
    }
    return false;
  }

  /**
   * Get the current active emergency shutdown event (or null).
   */
  async getActiveEvent(): Promise<EmergencyShutdownEvent | null> {
    if (this.cachedActiveEvent) return this.cachedActiveEvent;
    await this.loadActiveEvent();
    return this.cachedActiveEvent;
  }

  /**
   * Activate the platform-wide emergency shutdown.
   *
   * - Idempotent: returns the existing event if already active.
   * - Force-closes ALL open positions across ALL users.
   * - Audit-logs the activation.
   *
   * @param adminId  The SUPER_ADMIN user ID activating the shutdown.
   * @param reason   Human-readable reason for the shutdown.
   * @param forceClose  If true, force-close all open positions. If false,
   *                    only halt new trading (existing positions remain open).
   */
  async activate(
    adminId: string,
    reason: string,
    forceClose: boolean = true,
  ): Promise<EmergencyShutdownEvent> {
    // Idempotent: if already active, return the existing event
    if (this.cachedActiveEvent) {
      this.logger.warn(
        `[EmergencyShutdown] Already active — returning existing event ${this.cachedActiveEvent.id}`,
      );
      return this.cachedActiveEvent;
    }

    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'A detailed reason (min 10 chars) is required for emergency shutdown activation.',
      );
    }

    // Create the event record first (so the halt takes effect immediately)
    const event = this.eventRepo.create({
      isActive: true,
      activatedBy: adminId,
      activatedAt: new Date(),
      reason: reason.trim(),
      forceCloseExecuted: false,
      positionsClosed: 0,
    });
    const saved = await this.eventRepo.save(event);
    this.cachedActiveEvent = saved;

    this.logger.error(
      `[EmergencyShutdown] ACTIVATED by ${adminId} — reason: ${reason}. ` +
        `Force-close: ${forceClose}. ALL TRADING HALTED.`,
    );

    await this.auditService.log({
      actorUserId: adminId,
      actorType: 'SUPER_ADMIN',
      action: AuditAction.RISK_KILL_SWITCH_ACTIVATED,
      resourceType: 'EmergencyShutdownEvent',
      resourceId: saved.id,
      metadata: {
        action: 'EMERGENCY_SHUTDOWN_ACTIVATED',
        reason: reason.trim(),
        forceClose,
      },
      severity: AuditSeverity.CRITICAL,
    });

    // Force-close all open positions if requested
    if (forceClose) {
      try {
        const closedCount = await this.forceCloseAllOpenPositions(adminId, saved.id);
        saved.forceCloseExecuted = true;
        saved.positionsClosed = closedCount;
        await this.eventRepo.save(saved);
        this.logger.log(`[EmergencyShutdown] Force-closed ${closedCount} open positions.`);
      } catch (err) {
        this.logger.error(
          `[EmergencyShutdown] Force-close FAILED: ${(err as Error).message}. ` +
            `Trading is still halted but some positions may remain open.`,
        );
        // Do NOT rethrow — the shutdown itself succeeded; force-close is best-effort
      }
    }

    return saved;
  }

  /**
   * Deactivate the platform-wide emergency shutdown.
   *
   * - Only SUPER_ADMIN can deactivate.
   * - The event remains in the audit log (immutable).
   * - Trading resumes immediately after deactivation.
   */
  async deactivate(adminId: string, reason: string): Promise<EmergencyShutdownEvent> {
    if (!this.cachedActiveEvent) {
      throw new BadRequestException('No active emergency shutdown to deactivate.');
    }

    if (!reason || reason.trim().length < 10) {
      throw new BadRequestException(
        'A detailed reason (min 10 chars) is required for deactivation.',
      );
    }

    const event = this.cachedActiveEvent;
    event.isActive = false;
    event.deactivatedBy = adminId;
    event.deactivatedAt = new Date();
    const saved = await this.eventRepo.save(event);
    this.cachedActiveEvent = null;

    this.logger.log(
      `[EmergencyShutdown] DEACTIVATED by ${adminId} — reason: ${reason}. Trading resumed.`,
    );

    await this.auditService.log({
      actorUserId: adminId,
      actorType: 'SUPER_ADMIN',
      action: AuditAction.RISK_KILL_SWITCH_ACTIVATED,
      resourceType: 'EmergencyShutdownEvent',
      resourceId: saved.id,
      metadata: {
        action: 'EMERGENCY_SHUTDOWN_DEACTIVATED',
        reason: reason.trim(),
      },
      severity: AuditSeverity.CRITICAL,
    });

    return saved;
  }

  /**
   * Force-close ALL open positions across ALL users and ALL broker connections.
   *
   * This iterates every OPEN trade, connects to its broker, and calls
   * closeAllOrders(). It is best-effort — if a broker is unreachable, the
   * trade remains OPEN and is logged for manual intervention.
   *
   * @returns The number of positions successfully closed.
   */
  private async forceCloseAllOpenPositions(adminId: string, eventId: string): Promise<number> {
    const tradeRepo = this.dataSource.getRepository(Trade);
    const openTrades = await tradeRepo.find({
      where: { status: TradeStatus.OPEN },
      take: 10000,
    });

    if (openTrades.length === 0) {
      this.logger.log('[EmergencyShutdown] No open positions to force-close.');
      return 0;
    }

    this.logger.warn(`[EmergencyShutdown] Force-closing ${openTrades.length} open positions...`);

    // Group trades by broker connection for batch close
    const connectionIds = [...new Set(openTrades.map((t) => t.brokerConnectionId))];
    let closedCount = 0;

    for (const connectionId of connectionIds) {
      try {
        const tradesForConnection = openTrades.filter((t) => t.brokerConnectionId === connectionId);
        const connection = await this.brokerService.findConnectionByIdForAdmin(connectionId);

        if (!connection) {
          this.logger.error(
            `[EmergencyShutdown] Connection ${connectionId} not found — skipping ${tradesForConnection.length} trades.`,
          );
          continue;
        }

        if (connection.status !== BrokerConnectionStatus.CONNECTED) {
          this.logger.warn(
            `[EmergencyShutdown] Connection ${connectionId} not CONNECTED (status: ${connection.status}) — skipping ${tradesForConnection.length} trades.`,
          );
          continue;
        }

        // Decrypt credentials, connect, close all
        const credentials = this.encryptionService.decrypt({
          ciphertext: connection.encryptedCredentials!,
          iv: connection.credentialIv!,
          tag: connection.credentialTag!,
          keyId: connection.encryptionKeyId!,
        });

        const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
        adapter.setMode(connection.accountType);
        await adapter.connect(credentials);

        // Zero credentials immediately
        (Object.keys(credentials) as (keyof typeof credentials)[]).forEach((k) => {
          (credentials as unknown as Record<string, unknown>)[k] = null;
        });

        const result = await adapter.closeAllOrders();
        closedCount += result.closedCount;

        // Mark trades as CLOSED with force-close reason
        await tradeRepo.update(
          { brokerConnectionId: connectionId, status: TradeStatus.OPEN },
          {
            status: TradeStatus.CLOSED,
            closedAt: new Date(),
            closeReason: 'KILL_SWITCH_FORCE_CLOSE' as any,
          },
        );

        await this.auditService.log({
          actorUserId: adminId,
          actorType: 'SUPER_ADMIN',
          action: AuditAction.TRADE_CLOSED,
          resourceType: 'EmergencyShutdownEvent',
          resourceId: eventId,
          metadata: {
            connectionId,
            brokerId: connection.brokerId,
            positionsClosed: result.closedCount,
            forceClose: true,
          },
          severity: AuditSeverity.CRITICAL,
        });

        // Disconnect after use
        await adapter.disconnect().catch(() => void 0);
      } catch (err) {
        this.logger.error(
          `[EmergencyShutdown] Failed to force-close positions for connection ${connectionId}: ${(err as Error).message}`,
        );
      }
    }

    return closedCount;
  }
}
