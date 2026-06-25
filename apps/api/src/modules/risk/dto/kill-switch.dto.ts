import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ToggleKillSwitchDto {
  @ApiProperty({
    description: 'true = activate kill switch (stop all trading), false = deactivate',
    example: true,
  })
  @IsBoolean()
  active: boolean;

  @ApiPropertyOptional({
    description: 'Reason for toggling kill switch (stored in audit log)',
    example: 'Unusual market volatility — pausing trading manually',
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
