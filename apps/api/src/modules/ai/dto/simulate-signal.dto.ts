import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * SimulateSignalDto — Request body for the DEV-ONLY simulate-signal endpoint.
 *
 * This endpoint is disabled in production.
 * It exists only for testing the Strategy Orchestrator pipeline without
 * a real Python AI service.
 *
 * IMPORTANT: Signals submitted here go through the FULL pipeline:
 *   Strategy Orchestrator → Risk Engine → Execution Engine → Broker Adapter
 *
 * There is NO shortcut to the broker.
 */
export class SimulateSignalDto {
  @ApiProperty({ description: 'Trading session ID', example: 'uuid-v4' })
  @IsUUID()
  tradingSessionId: string;

  @ApiProperty({ description: 'Broker connection ID', example: 'uuid-v4' })
  @IsUUID()
  brokerConnectionId: string;

  @ApiProperty({ description: 'Forex instrument', example: 'EURUSD' })
  @IsString()
  instrument: string;

  @ApiProperty({ enum: ['BUY', 'SELL'] })
  @IsEnum(['BUY', 'SELL'])
  direction: 'BUY' | 'SELL';

  @ApiProperty({ description: 'Model confidence score 0–1', example: 0.75 })
  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore: number;

  @ApiPropertyOptional({ description: 'Suggested entry price (null = market order)' })
  @IsOptional()
  @IsNumber()
  suggestedEntryPrice?: number;

  @ApiProperty({ description: 'Stop-loss price' })
  @IsNumber()
  suggestedStopLoss: number;

  @ApiProperty({ description: 'Take-profit price' })
  @IsNumber()
  suggestedTakeProfit: number;

  @ApiProperty({ description: 'Lot size', example: 0.01 })
  @IsNumber()
  @Min(0.01)
  suggestedVolume: number;

  @ApiProperty({ description: 'Chart timeframe', example: 'H1' })
  @IsString()
  timeframe: string;

  @ApiProperty({ description: 'Internal strategy code', example: 'TREND_FOLLOW_V1' })
  @IsString()
  strategyCode: string;

  @ApiPropertyOptional({ description: 'Market regime (trending/ranging/volatile)' })
  @IsOptional()
  @IsString()
  marketRegime?: string;

  @ApiPropertyOptional({ description: 'Volatility score 0–1' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  volatilityScore?: number;

  @ApiProperty({ description: 'AI model version', example: '1.0.0-dev' })
  @IsString()
  modelVersion: string;
}
