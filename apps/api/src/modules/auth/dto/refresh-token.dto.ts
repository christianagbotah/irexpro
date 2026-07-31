import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * RefreshTokenDto — Sprint 25 amendment.
 *
 * refreshToken is OPTIONAL in the body because web/admin send it via httpOnly
 * cookie instead. Mobile sends it in the JSON body. The controller checks the
 * cookie first, then falls back to the body.
 */
export class RefreshTokenDto {
  @ApiPropertyOptional({ description: 'Refresh token (mobile flow). Web/admin send it via httpOnly cookie.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
