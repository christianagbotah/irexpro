import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { BrokerConnectionStatus, BrokerMode } from '../interfaces/broker-adapter.interface';

/**
 * BrokerConnectionResponseDto — Safe response DTO for broker connections.
 *
 * All encrypted credential fields are explicitly excluded.
 * This DTO is the only shape ever returned to the frontend.
 */
@Exclude()
export class BrokerConnectionResponseDto {
  @Expose()
  @ApiProperty()
  id: string;

  @Expose()
  @ApiProperty()
  brokerId: string;

  @Expose()
  @ApiProperty()
  brokerName: string;

  @Expose()
  @ApiPropertyOptional()
  displayName: string | null;

  @Expose()
  @ApiPropertyOptional({ description: 'Broker-side account ID (not a secret)' })
  accountId: string | null;

  @Expose()
  @ApiProperty({ enum: BrokerMode })
  accountType: BrokerMode;

  @Expose()
  @ApiPropertyOptional()
  accountCurrency: string | null;

  @Expose()
  @ApiPropertyOptional()
  accountLeverage: number | null;

  @Expose()
  @ApiProperty({ enum: BrokerConnectionStatus })
  status: BrokerConnectionStatus;

  @Expose()
  @ApiProperty()
  demoValidated: boolean;

  @Expose()
  @ApiProperty()
  liveTradingEnabled: boolean;

  @Expose()
  @ApiPropertyOptional()
  lastHealthCheckAt: Date | null;

  @Expose()
  @ApiPropertyOptional()
  lastSyncAt: Date | null;

  @Expose()
  @ApiPropertyOptional()
  lastErrorMessage: string | null;

  @Expose()
  @ApiProperty()
  createdAt: Date;

  @Expose()
  @ApiProperty()
  updatedAt: Date;

  // Credential fields are NEVER exposed — @Exclude() on the class handles it
}
