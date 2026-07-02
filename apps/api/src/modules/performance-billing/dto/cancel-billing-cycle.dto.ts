import { IsNotEmpty, IsString } from 'class-validator';

export class CancelBillingCycleDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}
