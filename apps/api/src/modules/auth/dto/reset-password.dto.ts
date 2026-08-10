import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * ResetPasswordDto — Sprint 28.
 *
 * Supports two flows:
 *
 * 1. Email token flow (web/admin):
 *    { "token": "raw-token-from-reset-link", "password": "NewStrongPassword123!" }
 *
 * 2. Phone code flow (mobile/phone-only users):
 *    { "identifier": "+233241234567", "code": "123456", "password": "NewStrongPassword123!" }
 *
 * The controller checks which fields are present and routes to the appropriate
 * service method. At least one of (token) or (identifier + code) is required.
 *
 * Password requirements: min 12 chars, must contain at least one letter and
 * one number (same as bootstrap admin).
 */
export class ResetPasswordDto {
  @ApiPropertyOptional({ description: 'Raw reset token from the email reset link (email flow)' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token?: string;

  @ApiPropertyOptional({
    description: 'Phone number or email (phone code flow)',
    example: '+233241234567',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier?: string;

  @ApiPropertyOptional({
    description: '6-digit numeric code sent via SMS (phone code flow)',
    example: '123456',
  })
  @IsOptional()
  @IsString()
  @Length(6, 6)
  code?: string;

  @ApiProperty({
    description: 'New password (min 12 chars, must contain letters + numbers)',
    example: 'NewStrongPassword123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/[a-zA-Z]/, { message: 'password must contain at least one letter' })
  @Matches(/[0-9]/, { message: 'password must contain at least one number' })
  password: string;
}
