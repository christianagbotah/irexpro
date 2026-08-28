import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrokerConnectionStatus, BrokerMode } from '../interfaces/broker-adapter.interface';

export enum PortfolioSnapshotFreshness {
  FRESH = 'FRESH',
  STALE = 'STALE',
}

export enum PortfolioSnapshotUnavailableReason {
  NO_SYNC = 'NO_SYNC',
  CURRENCY_UNAVAILABLE = 'CURRENCY_UNAVAILABLE',
  UNVERIFIED_ZERO_PLACEHOLDER = 'UNVERIFIED_ZERO_PLACEHOLDER',
}

export class PortfolioFinancialSnapshotDto {
  @ApiProperty({
    description: 'Authoritative broker account currency as a three-letter uppercase code.',
    example: 'USD',
  })
  currency: string;

  @ApiProperty({ description: 'Last synchronized broker balance as a decimal string.' })
  balance: string;

  @ApiProperty({ description: 'Last synchronized broker equity as a decimal string.' })
  equity: string;

  @ApiProperty({ enum: PortfolioSnapshotFreshness })
  freshness: PortfolioSnapshotFreshness;

  @ApiProperty({
    type: String,
    format: 'date-time',
    description: 'Server timestamp of the broker financial snapshot.',
  })
  syncedAt: Date;

  @ApiProperty({
    description: 'Server-computed snapshot age in whole seconds at response construction time.',
    minimum: 0,
  })
  ageSeconds: number;
}

/**
 * Frontend-safe portfolio account projection.
 *
 * Deliberately excludes provider account identifiers, credentials, health error
 * internals, and financial fields that are not reliably refreshed by the current
 * broker sync path. Monetary values are emitted only when an explicit currency
 * and a verified/non-placeholder sync are available.
 */
export class PortfolioAccountSnapshotResponseDto {
  @ApiProperty({ format: 'uuid' })
  connectionId: string;

  @ApiProperty()
  brokerName: string;

  @ApiPropertyOptional({ nullable: true })
  displayName: string | null;

  @ApiProperty({ enum: BrokerMode })
  accountType: BrokerMode;

  @ApiProperty({ enum: BrokerConnectionStatus })
  connectionStatus: BrokerConnectionStatus;

  @ApiProperty()
  liveTradingEnabled: boolean;

  @ApiPropertyOptional({ type: PortfolioFinancialSnapshotDto, nullable: true })
  snapshot: PortfolioFinancialSnapshotDto | null;

  @ApiPropertyOptional({
    enum: PortfolioSnapshotUnavailableReason,
    nullable: true,
    description: 'Why no financial snapshot is exposed for this account.',
  })
  snapshotUnavailableReason: PortfolioSnapshotUnavailableReason | null;
}
