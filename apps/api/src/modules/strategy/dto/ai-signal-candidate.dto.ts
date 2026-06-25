import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  IsDateString,
} from 'class-validator';

export class AiSignalCandidateDto {
  @IsUUID()
  signalId: string;

  @IsUUID()
  userId: string;

  @IsUUID()
  tradingSessionId: string;

  @IsUUID()
  brokerConnectionId: string;

  @IsString()
  instrument: string;

  @IsEnum(['BUY', 'SELL'])
  direction: 'BUY' | 'SELL';

  @IsNumber()
  @Min(0)
  @Max(1)
  confidenceScore: number;

  @IsOptional()
  @IsNumber()
  suggestedEntryPrice?: number;

  @IsNumber()
  suggestedStopLoss: number;

  @IsNumber()
  suggestedTakeProfit: number;

  @IsNumber()
  @Min(0.01)
  suggestedVolume: number;

  @IsString()
  timeframe: string;

  @IsString()
  strategyCode: string;

  @IsOptional()
  @IsString()
  marketRegime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  volatilityScore?: number;

  @IsDateString()
  generatedAt: Date;

  @IsString()
  modelVersion: string;

  @IsOptional()
  metadata?: Record<string, unknown>;
}
