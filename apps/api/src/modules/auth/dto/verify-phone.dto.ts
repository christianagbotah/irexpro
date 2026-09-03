import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class VerifyPhoneDto {
  @ApiProperty({
    example: '123456',
    description: 'Six-digit single-use phone verification code',
  })
  @IsString()
  @Matches(/^\d{6}$/u, { message: 'code must be a six-digit number' })
  code: string;
}
