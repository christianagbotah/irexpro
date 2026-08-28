import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import {
  TradingSession,
  TradingSessionStatus,
} from '../../execution/entities/trading-session.entity';

/**
 * Frontend-safe trading-session response.
 *
 * Intentionally excludes userId, openingBalance, peakEquity, and the internal
 * riskProfileSnapshot. Financial values will be exposed only through dedicated
 * authoritative portfolio/performance contracts in later terminal slices.
 */
@Exclude()
export class TradingSessionResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  brokerConnectionId: string;

  @Expose()
  @ApiProperty({ enum: TradingSessionStatus })
  status: TradingSessionStatus;

  @Expose()
  @ApiProperty()
  startedAt: Date;

  @Expose()
  @ApiPropertyOptional()
  endedAt: Date | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;
}

/**
 * Explicit mapper rather than Object.assign so internal entity fields never
 * become own-properties on the response object, even before serialization.
 */
export function toTradingSessionResponse(session: TradingSession): TradingSessionResponseDto {
  const response = new TradingSessionResponseDto();
  response.id = session.id;
  response.brokerConnectionId = session.brokerConnectionId;
  response.status = session.status;
  response.startedAt = session.startedAt;
  response.endedAt = session.endedAt;
  response.createdAt = session.createdAt;
  response.updatedAt = session.updatedAt;
  return response;
}
