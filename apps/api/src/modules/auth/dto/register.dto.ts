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
} from 'class-validator';

/**
 * RegisterDto — Sprint 27: supports email OR phone registration.
 *
 * At least one of `email` or `phone` must be provided. Both can be provided
 * if the user wants to register with both. The backend checks for duplicates
 * on whichever fields are provided.
 *
 * `phone` should include the country calling code (e.g. "+233241234567").
 * The frontend country-code selector concatenates the calling code with the
 * raw phone number before submitting.
 */
export class RegisterDto {
  @ApiPropertyOptional({ example: 'user@example.com' })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: '+233241234567', description: 'Phone number with country calling code' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ example: 'SecureP@ssw0rd!' })
  @IsString()
  @IsNotEmpty()
  @Length(8, 128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/, {
    message:
      'Password must contain uppercase, lowercase, number, and special character',
  })
  password: string;

  @ApiPropertyOptional({ example: 'GH' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({ example: false, description: 'If true, refresh cookie persists for 7 days.' })
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}
