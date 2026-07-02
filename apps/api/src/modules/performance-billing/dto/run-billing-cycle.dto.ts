import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/** Used for the direct-run endpoint (create + run in one call). */
export class RunBillingCycleDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  brokerConnectionId?: string | null;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsString()
  @IsNotEmpty()
  currency: string;
}
