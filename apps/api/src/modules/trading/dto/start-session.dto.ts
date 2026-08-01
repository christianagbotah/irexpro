import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AllowedTradingMode } from '../../risk/entities/risk-profile.entity';

/**
 * StartSessionDto — Sprint 29 amendment.
 *
 * Adds `requestedMode` so the user can request PAPER_ONLY, SEMI_AUTO, or
 * FULL_AUTO. The TradingService validates this against the user's
 * `riskProfile.allowedTradingModes` — the requested mode must be permitted
 * by the risk profile.
 *
 * If `requestedMode` is omitted, defaults to PAPER_ONLY (safest).
 */
export class StartSessionDto {
  @ApiPropertyOptional({
    description:
      'Specific broker connection ID to use. ' +
      'If omitted, the first active CONNECTED broker connection is used.',
    example: 'uuid-v4',
  })
  @IsOptional()
  @IsUUID()
  brokerConnectionId?: string;

  @ApiPropertyOptional({
    description:
      'Requested trading mode. Must be permitted by riskProfile.allowedTradingModes. ' +
      'Defaults to PAPER_ONLY (safest). FULL_AUTO does NOT automatically enable live broker execution — ' +
      'live trading requires a separate explicit enablement on the broker connection.',
    enum: AllowedTradingMode,
    example: 'PAPER_ONLY',
  })
  @IsOptional()
  @IsEnum(AllowedTradingMode)
  requestedMode?: AllowedTradingMode;
}
