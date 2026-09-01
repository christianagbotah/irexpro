import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { EligibilityReviewDecision } from '../entities/user-eligibility-review.entity';

export class ReviewUserEligibilityDto {
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
