import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Transform } from 'class-transformer';
import { BillingFrequency } from '../entities/performance-fee-policy.entity';

export class CreatePolicyDto {
  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  /**
   * Fee percentage as a decimal number (e.g. 20 = 20%, 15.5 = 15.5%).
   * Stored with 4 decimal place precision in the database.
   */
  @Transform(({ value }: { value: unknown }) => parseFloat(String(value)))
  @Min(0)
  @Max(100)
  feePercent: number;

  @IsEnum(BillingFrequency)
  billingFrequency: BillingFrequency;
}
