import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

/**
 * LoginDto — Sprint 27: supports email OR phone as identifier + rememberMe.
 *
 * `identifier` accepts either an email address or a phone number.
 * The backend resolves which field to query by checking the format.
 *
 * `rememberMe` controls the refresh cookie maxAge:
 *   - false (default): session cookie (cleared on browser close)
 *   - true: 7-day persistent cookie
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
    example: false,
    description: 'If true, refresh cookie persists for 7 days. If false, session cookie.',
  })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
