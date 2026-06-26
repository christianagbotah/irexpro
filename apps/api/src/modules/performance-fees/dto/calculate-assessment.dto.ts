import { IsDateString, IsISO8601, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CalculateAssessmentDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  brokerConnectionId?: string;

  /** ISO 4217 currency code (e.g. USD, EUR, GBP) */
  @IsNotEmpty()
  @IsString()
  currency: string;

  @IsISO8601()
  @IsDateString()
  periodStart: string;

  @IsISO8601()
  @IsDateString()
  periodEnd: string;
}
