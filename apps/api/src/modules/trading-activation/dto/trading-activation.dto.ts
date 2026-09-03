import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { AllowedTradingMode } from '../../risk/entities/risk-profile.entity';

export class ActivateLiveTradingDto {
  @IsEnum(AllowedTradingMode)
  targetMode: AllowedTradingMode.SEMI_AUTO | AllowedTradingMode.FULL_AUTO;

  @IsNotEmpty()
  @IsString()
  @MinLength(20)
  acknowledgement: string;
}

export class DeactivateLiveTradingDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  reason: string;
}
