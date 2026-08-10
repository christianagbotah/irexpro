import { IsDateString, IsNotEmpty, IsUUID, ValidateIf } from 'class-validator';

/**
 * DTO for triggering a broker trade reconciliation run.
 *
 * RULES:
 * - fromTime must be before toTime.
 * - toTime must not be in the future.
 * - Maximum window: 90 days.
 * - Admin/internal only.
 */
export class RunReconciliationDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  brokerConnectionId: string;

  @IsDateString()
  @IsNotEmpty()
  fromTime: string;

  @IsDateString()
  @IsNotEmpty()
  toTime: string;
}
