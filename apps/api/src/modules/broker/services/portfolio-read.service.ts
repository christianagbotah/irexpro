import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BrokerAccount } from '../entities/broker-account.entity';
import { BrokerConnection } from '../entities/broker-connection.entity';
import { BrokerConnectionStatus } from '../interfaces/broker-adapter.interface';
import {
  PortfolioAccountSnapshotResponseDto,
  PortfolioSnapshotFreshness,
  PortfolioSnapshotUnavailableReason,
} from '../dto/portfolio-account-snapshot-response.dto';

/**
 * Broker health checks are scheduled every 60 seconds. Three missed intervals
 * is the first user-facing stale threshold for Portfolio Truth v1.
 */
export const PORTFOLIO_SNAPSHOT_STALE_AFTER_MS = 3 * 60 * 1000;

function normalizeCurrency(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null;
}

function isZeroDecimal(value: string): boolean {
  return /^[-+]?0+(?:\.0+)?$/.test(value.trim());
}

@Injectable()
export class PortfolioReadService {
  constructor(
    @InjectRepository(BrokerConnection)
    private readonly connectionRepo: Repository<BrokerConnection>,
    @InjectRepository(BrokerAccount)
    private readonly accountRepo: Repository<BrokerAccount>,
  ) {}

  async listAccounts(
    userId: string,
    now: Date = new Date(),
  ): Promise<PortfolioAccountSnapshotResponseDto[]> {
    const connections = await this.connectionRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    if (connections.length === 0) return [];

    const connectionIds = connections.map((connection) => connection.id);
    const accounts = await this.accountRepo.find({
      where: { brokerConnectionId: In(connectionIds) },
    });
    const accountByConnection = new Map(
      accounts.map((account) => [account.brokerConnectionId, account]),
    );

    return connections.map((connection) =>
      this.toFrontendSnapshot(connection, accountByConnection.get(connection.id), now),
    );
  }

  private toFrontendSnapshot(
    connection: BrokerConnection,
    account: BrokerAccount | undefined,
    now: Date,
  ): PortfolioAccountSnapshotResponseDto {
    const base = {
      connectionId: connection.id,
      brokerName: connection.brokerName,
      displayName: connection.displayName,
      accountType: connection.accountType,
      connectionStatus: connection.status,
      liveTradingEnabled: connection.liveTradingEnabled,
    };

    if (!account?.syncedAt) {
      return {
        ...base,
        snapshot: null,
        snapshotUnavailableReason: PortfolioSnapshotUnavailableReason.NO_SYNC,
      };
    }

    const currency = normalizeCurrency(account.currency);
    if (!currency) {
      return {
        ...base,
        snapshot: null,
        snapshotUnavailableReason: PortfolioSnapshotUnavailableReason.CURRENCY_UNAVAILABLE,
      };
    }

    const accountSyncMs = account.syncedAt.getTime();
    const healthMarkerMs = connection.lastHealthCheckAt?.getTime() ?? null;
    const verifiedAfterHealthMarker = healthMarkerMs !== null && accountSyncMs > healthMarkerMs;
    const hasNonZeroFinancialValue =
      !isZeroDecimal(account.balance) || !isZeroDecimal(account.equity);

    // Compatibility guard for the current broker connect flow: connection
    // establishment may create a zero-valued BrokerAccount row and stamp
    // syncedAt before any balance/equity request has succeeded. Never present
    // that placeholder as broker truth. A genuine zero-balance account is
    // intentionally withheld until a subsequent verified health sync proves it.
    if (!verifiedAfterHealthMarker && !hasNonZeroFinancialValue) {
      return {
        ...base,
        snapshot: null,
        snapshotUnavailableReason: PortfolioSnapshotUnavailableReason.UNVERIFIED_ZERO_PLACEHOLDER,
      };
    }

    const ageMs = Math.max(0, now.getTime() - accountSyncMs);
    const stale =
      ageMs > PORTFOLIO_SNAPSHOT_STALE_AFTER_MS ||
      !verifiedAfterHealthMarker ||
      connection.status !== BrokerConnectionStatus.CONNECTED;

    return {
      ...base,
      snapshot: {
        currency,
        balance: account.balance,
        equity: account.equity,
        freshness: stale ? PortfolioSnapshotFreshness.STALE : PortfolioSnapshotFreshness.FRESH,
        syncedAt: account.syncedAt,
        ageSeconds: Math.floor(ageMs / 1000),
      },
      snapshotUnavailableReason: null,
    };
  }
}
