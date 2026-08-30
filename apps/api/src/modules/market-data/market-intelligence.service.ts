import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AuditAction } from '../../common/enums/audit-action.enum';
import { BrokerAdapterRegistry } from '../broker/adapters/broker-adapter.registry';
import { BrokerService } from '../broker/broker.service';
import { CredentialEncryptionService } from '../broker/services/credential-encryption.service';
import { AuditService } from '../audit/audit.service';
import { AuditSeverity } from '../audit/entities/audit-log.entity';
import { MarketIntelligenceQueryDto } from './dto/market-intelligence-query.dto';
import {
  MarketDataFreshness,
  MarketIntelligenceResponseDto,
} from './dto/market-intelligence-response.dto';

const QUOTE_FRESHNESS_MS = 60_000;
const TIMEFRAME_MS: Record<string, number> = {
  M1: 60_000,
  M5: 5 * 60_000,
  M15: 15 * 60_000,
  M30: 30 * 60_000,
  H1: 60 * 60_000,
  H4: 4 * 60 * 60_000,
  D1: 24 * 60 * 60_000,
};

function toIso(value: Date): string {
  const time = value.getTime();
  if (!Number.isFinite(time)) {
    throw new Error('Invalid market-data timestamp');
  }
  return value.toISOString();
}

function freshness(timestamp: Date, thresholdMs: number, nowMs: number): MarketDataFreshness {
  const ageMs = Math.max(0, nowMs - timestamp.getTime());
  return ageMs <= thresholdMs ? 'FRESH' : 'STALE';
}

/**
 * Authenticated, read-only market projection for trader-facing clients.
 *
 * The service reuses the same registered broker adapter infrastructure as the
 * internal AI market-data path but emits a deliberately narrower DTO. Broker
 * credentials are decrypted in memory only and are cleared in a finally block.
 */
@Injectable()
export class MarketIntelligenceService {
  private readonly logger = new Logger(MarketIntelligenceService.name);

  constructor(
    private readonly brokerService: BrokerService,
    private readonly adapterRegistry: BrokerAdapterRegistry,
    private readonly encryptionService: CredentialEncryptionService,
    private readonly auditService: AuditService,
  ) {}

  async getSnapshot(
    userId: string,
    query: MarketIntelligenceQueryDto,
  ): Promise<MarketIntelligenceResponseDto> {
    const instrument = query.instrument.toUpperCase();
    const timeframe = query.timeframe.toUpperCase();
    const connection = await this.brokerService.findActiveConnectionForUser(userId);

    if (
      !connection ||
      !connection.encryptedCredentials ||
      !connection.credentialIv ||
      !connection.credentialTag
    ) {
      throw new ServiceUnavailableException({
        code: 'MARKET_DATA_UNAVAILABLE',
        message: 'Live market data requires an active broker connection',
      });
    }

    const credentials = this.encryptionService.decrypt({
      ciphertext: connection.encryptedCredentials,
      iv: connection.credentialIv,
      tag: connection.credentialTag,
      keyId: connection.encryptionKeyId ?? 'env-key-v1',
    });
    const adapter = this.adapterRegistry.getAdapter(connection.brokerId);
    adapter.setMode(connection.accountType);

    try {
      await adapter.connect(credentials);
      const [quote, rawCandles] = await Promise.all([
        adapter.getCurrentPrice(instrument),
        adapter.getOHLCV(instrument, timeframe, query.limit),
      ]);

      const candles = rawCandles
        .map((candle) => ({
          timestamp: toIso(candle.timestamp),
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: candle.volume,
        }))
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

      if (candles.length === 0) {
        throw new Error('Broker returned no candles');
      }

      const nowMs = Date.now();
      const quoteFreshness = freshness(quote.timestamp, QUOTE_FRESHNESS_MS, nowMs);
      const latestCandleAt = new Date(candles[candles.length - 1].timestamp);
      const candleFreshness = freshness(
        latestCandleAt,
        (TIMEFRAME_MS[timeframe] ?? TIMEFRAME_MS.H1) * 2,
        nowMs,
      );
      const status: MarketDataFreshness =
        quoteFreshness === 'FRESH' && candleFreshness === 'FRESH' ? 'FRESH' : 'STALE';

      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.MARKET_DATA_REQUESTED,
        resourceType: 'BrokerConnection',
        resourceId: connection.id,
        metadata: {
          instrument,
          timeframe,
          limit: query.limit,
          count: candles.length,
          status,
        },
      });

      return {
        instrument,
        timeframe,
        source: 'BROKER',
        status,
        retrievedAt: new Date(nowMs).toISOString(),
        latestCandleAt: latestCandleAt.toISOString(),
        quote: {
          bid: quote.bid,
          ask: quote.ask,
          spread: quote.spread,
          timestamp: toIso(quote.timestamp),
          freshness: quoteFreshness,
        },
        candles,
      };
    } catch (error) {
      await this.auditService.log({
        actorUserId: userId,
        action: AuditAction.MARKET_DATA_REQUEST_FAILED,
        resourceType: 'BrokerConnection',
        resourceId: connection.id,
        metadata: { instrument, timeframe, reason: 'provider-unavailable' },
        severity: AuditSeverity.WARNING,
      });
      this.logger.warn(
        `Trader market-data request failed user=${userId} instrument=${instrument} timeframe=${timeframe}`,
      );
      throw new ServiceUnavailableException({
        code: 'MARKET_DATA_UNAVAILABLE',
        message: 'Unable to fetch live market data from broker at this time',
      });
    } finally {
      Object.keys(credentials).forEach((key) => {
        (credentials as unknown as Record<string, unknown>)[key] = null;
      });
    }
  }
}
