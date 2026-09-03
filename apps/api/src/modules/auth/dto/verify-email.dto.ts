import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @ApiProperty({ description: 'Single-use email verification token' })
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  @MaxLength(128)
  token: string;
}
