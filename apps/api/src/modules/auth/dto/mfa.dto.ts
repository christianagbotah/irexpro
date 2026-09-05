import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class BeginMfaSetupDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}

export class MfaCodeDto {
  @ApiProperty({ example: '123456', description: '6-digit authenticator code' })
  @IsString()
  @Matches(/^\d{6}$/u)
  code: string;
}

export class DisableMfaDto extends MfaCodeDto {
  @ApiProperty({ description: 'Current account password' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
