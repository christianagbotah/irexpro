import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

/**
 * LoginDto — supports email OR phone as identifier + optional TOTP challenge.
 *
 * `mfaCode` is required by AuthService only when the resolved account has MFA
 * enabled. Keeping the field optional at DTO level avoids revealing MFA state
 * before primary-credential verification.
 */
export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'Email address or phone number' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    example: '123456',
    description: '6-digit authenticator code when MFA is enabled for the account',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/u)
  mfaCode?: string;

  @ApiPropertyOptional({
    example: false,
    description: 'If true, refresh cookie persists for 7 days. If false, session cookie.',
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
