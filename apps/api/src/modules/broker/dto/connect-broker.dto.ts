import {
  IsEnum,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BrokerMode } from '../interfaces/broker-adapter.interface';

/**
 * ConnectBrokerDto — Input for creating a new broker connection.
 *
 * SECURITY: apiKey and apiSecret are write-only inputs.
 * They are encrypted immediately upon receipt and NEVER returned in any response.
 */
export class ConnectBrokerDto {
  @ApiProperty({ description: 'Broker identifier (e.g. "metatrader5")', example: 'metatrader5' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  brokerId: string;

  @ApiProperty({
    description: 'Account type — DEMO required before LIVE can be enabled',
    enum: BrokerMode,
    example: BrokerMode.DEMO,
  })
  @IsEnum(BrokerMode)
  accountType: BrokerMode;

  @ApiProperty({ description: 'Broker account ID', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  accountId: string;

  @ApiPropertyOptional({
    description: 'API key (write-only — encrypted at rest, never returned)',
    example: 'your-api-key',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiKey?: string;

  @ApiPropertyOptional({
    description: 'API secret (write-only — encrypted at rest, never returned)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  apiSecret?: string;

  @ApiPropertyOptional({
    description: 'Broker server URL (e.g. MetaAPI server endpoint)',
    example: 'https://mt-client-api-v1.agiliumtrade.ai',
  })
  @IsOptional()
  @IsUrl()
  @MaxLength(255)
  serverUrl?: string;

  @ApiPropertyOptional({
    description: 'User-friendly label for this connection',
    example: 'My ICMarkets Demo Account',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @ApiPropertyOptional({ description: 'Additional broker-specific parameters' })
  @IsOptional()
  @IsObject()
  additionalParams?: Record<string, string>;
}
