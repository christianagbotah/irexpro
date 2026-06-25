import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateRiskProfileDto {
  @ApiPropertyOptional({
    description: 'Max daily loss as % of opening balance (1–20%)',
    example: 5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.5)
  @Max(20)
  maxDailyLossPercent?: number;

  @ApiPropertyOptional({
    description: 'Max drawdown as % of peak equity (1–30%)',
    example: 10,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(30)
  maxDrawdownPercent?: number;

  @ApiPropertyOptional({ description: 'Max simultaneously open trades (1–20)', example: 3 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  maxOpenTrades?: number;

  @ApiPropertyOptional({ description: 'Max trades per day (1–50)', example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  maxDailyTrades?: number;

  @ApiPropertyOptional({ description: 'Max position size in lots (0.01–10)', example: 0.1 })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(10)
  maxPositionSizeLot?: number;

  @ApiPropertyOptional({ description: 'Min stop-loss distance in pips (1–50)', example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  minStopLossPips?: number;

  @ApiPropertyOptional({
    description: 'Allowed instrument symbols (null = all allowed)',
    example: ['EURUSD', 'GBPUSD'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedInstruments?: string[] | null;

  @ApiPropertyOptional({
    description: 'Max volatility score threshold 0.0–1.0',
    example: 0.85,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(1.0)
  maxVolatilityScore?: number;

  @ApiPropertyOptional({
    description: 'Reject trades during LOW_LIQUIDITY market regime',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  rejectLowLiquidity?: boolean;
}
