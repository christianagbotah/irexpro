import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { EligibilityReviewDecision } from '../entities/user-eligibility-review.entity';

export class ReviewUserEligibilityDto {
  @ApiProperty({ example: 'eligibility.2026-09', maxLength: 64 })
  @IsString()
  @Length(1, 64)
  policyVersion: string;

  @ApiProperty({ description: 'Lowercase SHA-256 digest of the exact policy snapshot reviewed.' })
  @IsString()
  @Matches(/^[a-f0-9]{64}$/)
  policyFingerprint: string;

  @ApiProperty({ enum: EligibilityReviewDecision })
  @IsEnum(EligibilityReviewDecision)
  decision: EligibilityReviewDecision;

  @ApiProperty({ example: 'MANUAL_REVIEW_COMPLETE', maxLength: 64 })
  @IsString()
  @MaxLength(64)
  reasonCode: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reviewerNote?: string;
}
