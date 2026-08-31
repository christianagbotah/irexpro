import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { AccountAppealDecision } from '../entities/account-appeal.entity';

export class ResolveAccountAppealDto {
  @ApiProperty({ enum: AccountAppealDecision })
  @IsEnum(AccountAppealDecision)
  decision: AccountAppealDecision;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNote?: string;
}
