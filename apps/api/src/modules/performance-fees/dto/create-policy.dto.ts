import { IsEnum, IsNotEmpty, IsString, Max, Min, IsEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { BillingFrequency } from '../entities/performance-fee-policy.entity';

/**
 * CreatePolicyDto
 *
 * GATE-3 BLOCKER 4 — new performance-fee policies must be GLOBAL (planId = null).
 * The subscription-plan-linked pricing model has been retired. planId is
 * explicitly rejected at the DTO layer via @IsEmpty() so any incoming value
 * (string, number, etc.) is rejected before the service is reached.
 */
export class CreatePolicyDto {
  /**
   * @deprecated GATE-3 — new policies must be GLOBAL. Any value is rejected.
   */
  @IsEmpty({ message: 'planId is not permitted — new policies must be GLOBAL (omit planId).' })
  planId?: never;

  @IsNotEmpty()
  @IsString()
  name: string;

  @Transform(({ value }: { value: unknown }) => parseFloat(String(value)))
  @Min(0)
  @Max(100)
  feePercent: number;

  @IsEnum(BillingFrequency)
  billingFrequency: BillingFrequency;
}
