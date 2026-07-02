import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateBillingCycleDto {
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
