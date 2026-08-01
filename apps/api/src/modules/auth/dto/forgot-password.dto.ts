import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * ForgotPasswordDto — Sprint 28.
 *
 * Accepts an `identifier` which can be an email address OR an international
 * phone number (e.g. +233241234567). The backend resolves which field to
 * query by checking the format (same as login).
 *
 * The response is ALWAYS the same generic message regardless of whether an
 * account exists — this prevents account enumeration.
 */
export class ForgotPasswordDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email address or international phone number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier: string;
}
