import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsUUID } from 'class-validator';

export class ManualActivateDto {
  @ApiProperty({ description: 'Target user ID to activate subscription for' })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({ description: 'Subscription plan ID to activate' })
  @IsUUID()
  @IsNotEmpty()
  planId: string;
}
