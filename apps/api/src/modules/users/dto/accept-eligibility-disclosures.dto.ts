import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsString,
  Length,
  Matches,
  ValidateNested,
} from 'class-validator';
import { EligibilityDisclosureKey } from '../entities/user-disclosure-consent.entity';

export class EligibilityDisclosureAcceptanceDto {
  @ApiProperty({ enum: EligibilityDisclosureKey })
  @IsEnum(EligibilityDisclosureKey)
  key: EligibilityDisclosureKey;

  @ApiProperty({ example: '1.0' })
  @IsString()
  @Length(1, 32)
  version: string;

  @ApiProperty({ description: 'Lowercase SHA-256 digest of the exact disclosure copy accepted.' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  contentSha256: string;
}

export class AcceptEligibilityDisclosuresDto {
  @ApiProperty({ type: [EligibilityDisclosureAcceptanceDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EligibilityDisclosureAcceptanceDto)
  acceptances: EligibilityDisclosureAcceptanceDto[];
}
