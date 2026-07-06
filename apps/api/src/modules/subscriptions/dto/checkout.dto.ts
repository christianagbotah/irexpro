import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length } from 'class-validator';

export class CheckoutDto {
  @ApiProperty({ description: 'Subscription plan ID' })
  @IsNotEmpty()
  @IsString()
  planId: string;

  @ApiProperty({ description: 'Billing currency (ISO 4217, e.g. USD, GHS, NGN)' })
  @IsNotEmpty()
  @IsString()
  @Length(3, 3)
  currency: string;

  @ApiPropertyOptional({ description: 'Preferred payment provider ID (optional)' })
  @IsOptional()
  @IsString()
  provider?: string;

  @ApiPropertyOptional({ description: 'Country code (ISO 3166-1 alpha-2, optional — derived from user profile if omitted)' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;

  @ApiPropertyOptional({
    description:
      'Optional client idempotency key. Reusing the same key with the same user and checkout ' +
      'parameters returns the original checkout instead of creating a new one. Prefer the ' +
      '`Idempotency-Key` request header instead of this field when possible.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 200)
  idempotencyKey?: string;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation (optional)' })
  @IsOptional()
  @IsString()
  reason?: string;
}
