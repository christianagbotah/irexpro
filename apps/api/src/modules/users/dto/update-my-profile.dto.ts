import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';
import { TradingExperienceLevel } from '../entities/user-profile.entity';

/**
 * UpdateMyProfileDto — Sprint 29.
 *
 * Allows the authenticated user to update their profile fields for onboarding.
 * Supports BOTH UserProfile fields (firstName, lastName, tradingExperienceLevel)
 * AND User-level fields (countryCode, timezone, preferredCurrency) that the
 * previous PATCH /users/me could not update.
 *
 * Email and phone are NOT updateable here (they require separate verification
 * flows). Password is NOT updateable here (use /auth/reset-password).
 */
export class UpdateMyProfileDto {
  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: 'GH', description: 'ISO 3166-1 alpha-2 country code' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiPropertyOptional({ example: 'Africa/Accra', description: 'IANA timezone' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Preferred ISO 4217 currency code' })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  preferredCurrency?: string;

  @ApiPropertyOptional({ enum: TradingExperienceLevel, description: 'Self-reported trading experience level' })
  @IsOptional()
  @IsEnum(TradingExperienceLevel)
  tradingExperienceLevel?: TradingExperienceLevel;
}
