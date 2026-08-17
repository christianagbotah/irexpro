import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BrokerConnection } from './entities/broker-connection.entity';
import { BrokerAccount } from './entities/broker-account.entity';
import { BrokerAdapterRegistry } from './adapters/broker-adapter.registry';
import { CredentialEncryptionService } from './services/credential-encryption.service';
import {
  BrokerConnectionStatus,
  BrokerMode,
  DecryptedBrokerCredentials,
  OHLCV,
} from './interfaces/broker-adapter.interface';
import { BrokerAdapterError } from './interfaces/broker-adapter.errors';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { ConnectBrokerDto } from './dto/connect-broker.dto';
import { DomainEventBus } from '../events/event-bus.service';
import { DomainEventType } from '../events/enums/domain-event-type.enum';

/**
 * BrokerService — Core broker connection lifecycle management.
 *
 * SECURITY INVARIANTS (enforced throughout):
 * 1. Decrypted credentials exist in memory only for the duration of the adapter call
 * 2. Credentials are NEVER logged — log only accountId, brokerId, connectionId
 * 3. Credentials are NEVER returned from any method or included in any response
 * 4. DEMO mode is mandatory before LIVE mode can be enabled
 * 5. Credential encryption/decryption delegated to CredentialEncryptionService only
 *
 * See: docs/architecture/09-broker-integration-architecture.md
 */
@Injectable()
export class BrokerService {
  private readonly logger = new Logger(BrokerService.name);

  constructor(
    @InjectRepository(BrokerConnection)
    private connectionRepo: Repository<BrokerConnection>,
    @InjectRepository(BrokerAccount)
    private accountRepo: Repository<BrokerAccount>,
    private adapterRegistry: BrokerAdapterRegistry,
    private encryptionService: CredentialEncryptionService,
    private auditService: AuditService,
    private readonly eventBus: DomainEventBus,
  ) {}

  // ─── Read operations ──────────────────────────────────────────────────────

  async findConnectionsByUser(userId: string): Promise<BrokerConnection[]> {
    return this.connectionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findConnectionById(connectionId: string, userId: string): Promise<BrokerConnection> {
    const connection = await this.connectionRepo.findOne({
      where: { id: connectionId, userId },
    });
    if (!connection) {
      throw new NotFoundException('Broker connection not found');
    }
    return connection;
  }

  async findActiveConnectionForUser(userId: string): Promise<BrokerConnection | null> {
    return this.connectionRepo.findOne({
      where: { userId, status: BrokerConnectionStatus.CONNECTED },
      order: { createdAt: 'DESC' },
    });
  }

  getSupportedBrokers() {
    return this.adapterRegistry.getSupportedBrokers();
  }

  // ─── Create / Test connection ─────────────────────────────────────────────

  /**
   * Test broker credentials without creating a persistent connection.
   * Returns connection test result. Credentials never logged or persisted here.
   */
  async testCredentials(
    dto: ConnectBrokerDto,
    userId: string,
    ipAddress?: string,
  ): Promise<{ success: boolean; accountId?: string; errorMessage?: string }> {
    const adapter = this.adapterRegistry.getAdapter(dto.brokerId);
    adapter.setMode(dto.accountType as BrokerMode);

    const credentials: DecryptedBrokerCredentials = {
      apiKey: dto.apiKey,
      apiSecret: dto.apiSecret,
      accountId: dto.accountId,
      serverUrl: dto.serverUrl,
      additionalParams: dto.additionalParams,
    };

    try {
      const result = await adapter.testConnection(credentials);

      await this.auditService.log({
        actorUserId: userId,
        action: result.success
          ? AuditAction.BROKER_CONNECTION_TESTED
          : AuditAction.BROKER_CONNECTION_TEST_FAILED,
        ipAddress,
        metadata: {
          brokerId: dto.brokerId,
          accountType: dto.accountType,
          success: result.success,
          errorCode: result.errorCode,
        },
      });

      return {
        success: result.success,
        accountId: result.accountId,
        errorMessage: result.errorMessage,
      };
    } catch (err) {
      const errMsg = err instanceof BrokerAdapterError ? err.message : 'Connection test failed';
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.BROKER_CONNECTION_TEST_FAILED,
        ipAddress,
        metadata: { brokerId: dto.brokerId, error: errMsg },
        severity: AuditSeverity.WARNING,
      });
      return { success: false, errorMessage: errMsg };
    }
  }

  /**
   * Save a broker connection with encrypted credentials.
   * Does NOT establish a live connection — use connectBroker() for that.
   */
  async createConnection(
    dto: ConnectBrokerDto,
    userId: string,
    ipAddress?: string,
  ): Promise<BrokerConnection> {
    if (!this.adapterRegistry.isSupported(dto.brokerId)) {
      throw new BadRequestException(`Unsupported broker: ${dto.brokerId}`);
    }

    const credentials: DecryptedBrokerCredentials = {
      apiKey: dto.apiKey,
      apiSecret: dto.apiSecret,
      accountId: dto.accountId,
      serverUrl: dto.serverUrl,
      additionalParams: dto.additionalParams,
    };

    const encrypted = this.encryptionService.encrypt(credentials);

    const connection = this.connectionRepo.create({
      userId,
      brokerId: dto.brokerId,
      brokerName: this.adapterRegistry.getAdapter(dto.brokerId).brokerName,
      displayName: dto.displayName ?? `${dto.brokerId} ${dto.accountType}`,
      accountId: dto.accountId,
      accountType: dto.accountType as BrokerMode,
      status: BrokerConnectionStatus.DISCONNECTED,
      encryptedCredentials: encrypted.ciphertext,
      credentialIv: encrypted.iv,
      credentialTag: encrypted.tag,
      encryptionKeyId: encrypted.keyId,
    });

    const saved = await this.connectionRepo.save(connection);

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.BROKER_CONNECTION_CREATED,
      resourceType: 'BrokerConnection',
      resourceId: saved.id,
      ipAddress,
      metadata: {
        brokerId: dto.brokerId,
        accountId: dto.accountId,
        accountType: dto.accountType,
      },
    });

    this.logger.log(
      `Broker connection created: id=${saved.id} broker=${dto.brokerId} user=${userId}`,
    );
    return saved;
  }

  // ─── Connect / Disconnect ─────────────────────────────────────────────────

  /**
   * Establish a live connection to the broker using stored encrypted credentials.
   * Decrypted credentials exist in memory only for the duration of this method.
   */
  async connectBroker(
    connectionId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<BrokerConnection> {
    const connection = await this.findConnectionById(connectionId, userId);
    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);

    if (!connection.encryptedCredentials || !connection.credentialIv || !connection.credentialTag) {
      throw new BadRequestException('Broker connection has no stored credentials');
    }

    await this.connectionRepo.update(connectionId, {
      status: BrokerConnectionStatus.CONNECTING,
      consecutiveFailureCount: 0,
    });

    // Decrypt — credentials are in memory only from here
    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials,
      iv: connection.credentialIv,
      tag: connection.credentialTag,
      keyId: connection.encryptionKeyId ?? 'env-key-v1',
    });

    adapter.setMode(connection.accountType);

    try {
      const result = await adapter.connect(credentials);

      if (!result.success) {
        await this.connectionRepo.update(connectionId, {
          status: BrokerConnectionStatus.ERROR,
          lastErrorMessage: result.error ?? 'Connection rejected by broker',
          consecutiveFailureCount: () => 'consecutive_failure_count + 1',
        });

        await this.auditService.log({
          actorUserId: userId,
          action: AuditAction.BROKER_CONNECT_FAILED,
          resourceType: 'BrokerConnection',
          resourceId: connectionId,
          ipAddress,
          metadata: { brokerId: connection.brokerId, error: result.error },
          severity: AuditSeverity.WARNING,
        });

        throw new BadRequestException(`Broker connection failed: ${result.error}`);
      }

      // Upsert BrokerAccount with latest synced state
      await this.upsertBrokerAccount(connectionId, result.currency);

      await this.connectionRepo.update(connectionId, {
        status: BrokerConnectionStatus.CONNECTED,
        accountId: result.accountId,
        accountCurrency: result.currency,
        lastHealthCheckAt: new Date(),
        consecutiveFailureCount: 0,
        lastErrorMessage: null,
      });

      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.BROKER_CONNECTED,
        resourceType: 'BrokerConnection',
        resourceId: connectionId,
        ipAddress,
        metadata: {
          brokerId: connection.brokerId,
          accountId: result.accountId,
          accountType: result.accountType,
          currency: result.currency,
        },
      });

      this.logger.log(
        `Broker connected: id=${connectionId} account=${result.accountId} user=${userId}`,
      );
    } finally {
      // Explicitly zero out reference — decrypted credentials go out of scope here
      Object.keys(credentials).forEach((k) => {
        (credentials as unknown as Record<string, unknown>)[k] = null;
      });
    }

    return this.findConnectionById(connectionId, userId);
  }

  /**
   * Disconnect a broker connection. Suspends trading if active.
   */
  async disconnectBroker(connectionId: string, userId: string, ipAddress?: string): Promise<void> {
    const connection = await this.findConnectionById(connectionId, userId);

    if (connection.status === BrokerConnectionStatus.CONNECTED) {
      try {
        const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
        await adapter.disconnect();
      } catch (err) {
        this.logger.warn(
          `Adapter disconnect error for connection ${connectionId}: ${(err as Error).message}`,
        );
      }
    }

    await this.connectionRepo.update(connectionId, {
      status: BrokerConnectionStatus.DISCONNECTED,
    });

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.BROKER_DISCONNECTED,
      resourceType: 'BrokerConnection',
      resourceId: connectionId,
      ipAddress,
      metadata: { brokerId: connection.brokerId },
    });
  }

  /**
   * Soft-delete a broker connection.
   * Disconnects first if connected.
   */
  async deleteConnection(connectionId: string, userId: string, ipAddress?: string): Promise<void> {
    const connection = await this.findConnectionById(connectionId, userId);

    if (connection.status === BrokerConnectionStatus.CONNECTED) {
      await this.disconnectBroker(connectionId, userId, ipAddress);
    }

    await this.connectionRepo.softDelete(connectionId);

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.BROKER_CONNECTION_DELETED,
      resourceType: 'BrokerConnection',
      resourceId: connectionId,
      ipAddress,
      metadata: { brokerId: connection.brokerId },
    });
  }

  // ─── Live trading gate ────────────────────────────────────────────────────

  /**
   * Enable LIVE trading for a connection.
   * ONLY possible after:
   *   1. DEMO connection exists and demoValidated = true
   *   2. The connection is currently CONNECTED
   *   3. Admin / user explicitly enables it
   *
   * Live trading without prior DEMO validation is an architectural violation.
   */
  async enableLiveTrading(connectionId: string, userId: string, ipAddress?: string): Promise<void> {
    const connection = await this.findConnectionById(connectionId, userId);

    if (connection.accountType !== BrokerMode.LIVE) {
      throw new BadRequestException('Only LIVE account connections can have live trading enabled');
    }

    // Find corresponding DEMO connection to verify demo was validated
    const demoConnection = await this.connectionRepo.findOne({
      where: {
        userId,
        brokerId: connection.brokerId,
        accountType: BrokerMode.DEMO,
        demoValidated: true,
      },
    });

    if (!demoConnection) {
      throw new ForbiddenException(
        'DEMO mode must be validated before LIVE trading can be enabled. ' +
          'Connect and validate a DEMO account for this broker first.',
      );
    }

    await this.connectionRepo.update(connectionId, { liveTradingEnabled: true });

    await this.auditService.log({
      actorUserId: userId,
      action: AuditAction.BROKER_LIVE_TRADING_ENABLED,
      resourceType: 'BrokerConnection',
      resourceId: connectionId,
      ipAddress,
      metadata: { brokerId: connection.brokerId },
      severity: AuditSeverity.WARNING,
    });
  }

  // ─── Health check ─────────────────────────────────────────────────────────

  /**
   * Return IDs of all broker connections currently in CONNECTED status.
   * Used by the BrokerHealthCheckJob to determine which connections to check.
   */
  async getAllConnectedConnectionIds(): Promise<string[]> {
    const connections = await this.connectionRepo.find({
      where: { status: BrokerConnectionStatus.CONNECTED },
      select: ['id'],
    });
    return connections.map((c) => c.id);
  }

  /**
   * Perform a health check on a single connection.
   *
   * Process:
   * 1. Decrypt stored credentials
   * 2. Call adapter.connect() — reuses the MetaAPI connection pool if available
   * 3. Call adapter.getAccountBalance() — verifies the connection is live
   * 4. Update BrokerAccount with latest balance snapshot
   * 5. On failure: increment counter, suspend after 3 consecutive failures
   *
   * Called by BrokerHealthCheckJob (every 60s) and on-demand from admin panel.
   */
  async healthCheck(connectionId: string): Promise<boolean> {
    const connection = await this.connectionRepo.findOne({ where: { id: connectionId } });
    if (!connection || connection.status !== BrokerConnectionStatus.CONNECTED) return false;

    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);

    if (!connection.encryptedCredentials || !connection.credentialIv || !connection.credentialTag) {
      this.logger.warn(`Connection ${connectionId} has no credentials — cannot health check`);
      return false;
    }

    // Decrypt in-memory only — NEVER logged
    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials,
      iv: connection.credentialIv,
      tag: connection.credentialTag,
      keyId: connection.encryptionKeyId ?? 'env-key-v1',
    });

    adapter.setMode(connection.accountType);

    try {
      // connect() reuses the MetaAPI connection pool — only reconnects if stale
      await adapter.connect(credentials);
      const balance = await adapter.getAccountBalance();

      await this.connectionRepo.update(connectionId, {
        lastHealthCheckAt: new Date(),
        consecutiveFailureCount: 0,
        lastErrorMessage: null,
      });

      await this.upsertBrokerAccount(connectionId, balance.currency, {
        balance: balance.balance,
        equity: balance.equity,
      });

      return true;
    } catch (err) {
      const failureCount = (connection.consecutiveFailureCount ?? 0) + 1;
      const SUSPEND_THRESHOLD = 3;

      await this.connectionRepo.update(connectionId, {
        consecutiveFailureCount: failureCount,
        lastErrorMessage: (err as Error).message,
        lastHealthCheckAt: new Date(),
        ...(failureCount >= SUSPEND_THRESHOLD ? { status: BrokerConnectionStatus.SUSPENDED } : {}),
      });

      if (failureCount >= SUSPEND_THRESHOLD) {
        this.logger.error(
          `Broker connection ${connectionId} suspended after ${failureCount} consecutive failures`,
        );
        await this.auditService.log({
          action: AuditAction.BROKER_SUSPENDED_HEALTH_FAILURE,
          resourceType: 'BrokerConnection',
          resourceId: connectionId,
          metadata: {
            brokerId: connection.brokerId,
            userId: connection.userId,
            failureCount,
          },
          severity: AuditSeverity.CRITICAL,
        });
        this.eventBus.publish(DomainEventType.BROKER_STATUS_CHANGED, connection.userId, {
          userId: connection.userId,
          connectionId,
          status: BrokerConnectionStatus.SUSPENDED,
          previousStatus: BrokerConnectionStatus.CONNECTED,
          reason: `Suspended after ${failureCount} consecutive health check failures`,
        });
      }

      return false;
    }
  }

  /**
   * Fetch OHLCV candles via the user's connected broker adapter.
   *
   * SECURITY:
   * - Verifies connection belongs to userId
   * - Requires CONNECTED status
   * - Credentials decrypted in-memory only — never logged or returned
   */
  async getOhlcvForConnection(
    userId: string,
    brokerConnectionId: string,
    instrument: string,
    timeframe: string,
    limit: number,
  ): Promise<OHLCV[]> {
    const connection = await this.findConnectionById(brokerConnectionId, userId);

    if (connection.status !== BrokerConnectionStatus.CONNECTED) {
      throw new ForbiddenException('Broker connection is not active');
    }

    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);

    if (!connection.encryptedCredentials || !connection.credentialIv || !connection.credentialTag) {
      throw new ForbiddenException('Broker connection credentials unavailable');
    }

    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials,
      iv: connection.credentialIv,
      tag: connection.credentialTag,
      keyId: connection.encryptionKeyId ?? 'env-key-v1',
    });

    adapter.setMode(connection.accountType);

    try {
      await adapter.connect(credentials);
      return await adapter.getOHLCV(instrument, timeframe, limit);
    } catch (err) {
      this.logger.warn(
        `OHLCV fetch failed connection=${brokerConnectionId} instrument=${instrument}: ` +
          `${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * Fetch closed trades for a broker connection using stored credentials.
   *
   * SECURITY:
   * - Verifies connection belongs to userId.
   * - Credentials decrypted in-memory only; zeroed out after the call.
   * - Returns the raw BrokerClosedTrade array; caller is responsible for normalization.
   *
   * Note: Caller must enforce time-range validation (fromTime < toTime, max window).
   */
  async getClosedTradesForConnection(
    connectionId: string,
    userId: string,
    from: Date,
    to: Date,
  ): Promise<{
    connection: BrokerConnection;
    trades: import('./interfaces/broker-adapter.interface').BrokerClosedTrade[];
  }> {
    const connection = await this.findConnectionById(connectionId, userId);

    if (connection.status !== BrokerConnectionStatus.CONNECTED) {
      throw new ForbiddenException(
        `Broker connection ${connectionId} is not CONNECTED (status: ${connection.status})`,
      );
    }

    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);

    if (!connection.encryptedCredentials || !connection.credentialIv || !connection.credentialTag) {
      throw new ForbiddenException('Broker connection credentials unavailable');
    }

    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials,
      iv: connection.credentialIv,
      tag: connection.credentialTag,
      keyId: connection.encryptionKeyId ?? 'env-key-v1',
    });

    adapter.setMode(connection.accountType);

    try {
      await adapter.connect(credentials);
      const trades = await adapter.getClosedTrades(from, to);
      return { connection, trades };
    } catch (err) {
      this.logger.warn(
        `getClosedTrades failed connection=${connectionId} from=${from.toISOString()} to=${to.toISOString()}: ` +
          `${(err as Error).message}`,
      );
      throw err;
    } finally {
      Object.keys(credentials).forEach((k) => {
        (credentials as unknown as Record<string, unknown>)[k] = null;
      });
    }
  }

  /**
   * Check whether a user has an active, connected broker account.
   * Used as the broker connection gate before AI trading can start.
   */
  async hasActiveConnection(userId: string): Promise<boolean> {
    const connection = await this.findActiveConnectionForUser(userId);
    return connection !== null;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  /**
   * Get the last-synced BrokerAccount state for a connection.
   * Used by RiskService for margin and equity checks.
   */
  async getBrokerAccountState(
    connectionId: string,
  ): Promise<{ balance: string; equity: string; freeMargin: string; currency: string } | null> {
    const account = await this.accountRepo.findOne({
      where: { brokerConnectionId: connectionId },
    });
    if (!account) return null;
    return {
      balance: account.balance,
      equity: account.equity,
      freeMargin: account.freeMargin,
      currency: account.currency ?? 'USD',
    };
  }

  /**
   * Sprint 32 Gate 2: get required margin for a proposed order through the
   * broker adapter abstraction. Delegates to the adapter's
   * getRequiredMargin() which uses broker-specific margin rules.
   *
   * Returns null if the adapter cannot calculate the required margin
   * (instrument not found, price unavailable, adapter error, etc.).
   * The Risk Engine fails closed when this returns null for LIVE execution.
   */
  async getRequiredMargin(
    connectionId: string,
    params: { instrument: string; lotSize: string; direction: 'BUY' | 'SELL' },
  ): Promise<string | null> {
    const connection = await this.connectionRepo.findOne({
      where: { id: connectionId },
    });
    if (!connection) return null;

    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
    adapter.setMode(connection.accountType);

    let credentials: DecryptedBrokerCredentials | null = null;
    try {
      let connectionReference: string | undefined;
      if (
        connection.encryptedCredentials &&
        connection.credentialIv &&
        connection.credentialTag
      ) {
        credentials = this.encryptionService.decrypt({
          ciphertext: connection.encryptedCredentials,
          iv: connection.credentialIv,
          tag: connection.credentialTag,
          keyId: connection.encryptionKeyId ?? 'env-key-v1',
        });
        connectionReference = credentials.accountId;
      }

      return await adapter.getRequiredMargin({
        ...params,
        connectionReference,
      });
    } catch {
      return null;
    } finally {
      if (credentials) {
        Object.keys(credentials).forEach((key) => {
          (credentials as unknown as Record<string, unknown>)[key] = null;
        });
      }
    }
  }

  private async upsertBrokerAccount(
    connectionId: string,
    currency?: string,
    updates?: { balance?: string; equity?: string },
  ): Promise<void> {
    const existing = await this.accountRepo.findOne({
      where: { brokerConnectionId: connectionId },
    });

    if (existing) {
      await this.accountRepo.update(existing.id, {
        currency: currency ?? existing.currency,
        balance: updates?.balance ?? existing.balance,
        equity: updates?.equity ?? existing.equity,
        syncedAt: new Date(),
      });
    } else {
      await this.accountRepo.save(
        this.accountRepo.create({
          brokerConnectionId: connectionId,
          currency: currency ?? null,
          balance: updates?.balance ?? '0',
          equity: updates?.equity ?? '0',
          syncedAt: new Date(),
        }),
      );
    }
  }
}
