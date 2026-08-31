import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Public appeal request. The response is deliberately generic so callers
 * cannot use this endpoint to discover whether an account exists.
 */
export class SubmitAccountAppealDto {
  @ApiProperty({ example: 'user@example.com or +233241234567' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier: string;

  @ApiProperty({
    example:
      'Please review my account. I can provide any information required to resolve the issue.',
    minLength: 20,
    maxLength: 2000,
  })
  @IsString()
  @MinLength(20)
  @MaxLength(2000)
  reason: string;
}
