import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { KycReviewDecision } from '../entities/user-kyc-review.entity';

export class ReviewUserKycDto {
  @ApiProperty({ enum: KycReviewDecision })
  @IsEnum(KycReviewDecision)
  decision: KycReviewDecision;

  @ApiProperty({ example: 'MANUAL_IDENTITY_VERIFIED' })
  @IsString()
  @MaxLength(64)
  reasonCode: string;

  @ApiPropertyOptional({
    description:
      'Optional internal reviewer note. Never returned to the user-facing eligibility screen.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reviewerNote?: string;
}
