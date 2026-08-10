import {
  IsDateString,
  IsEnum,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { LedgerEntryType } from '../entities/performance-fee-ledger-entry.entity';

export class CreateLedgerEntryDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsUUID()
  assessmentId?: string;

  @IsOptional()
  @IsUUID()
  brokerConnectionId?: string;

  @IsEnum(LedgerEntryType)
  entryType: LedgerEntryType;

  /** ISO 4217 currency code */
  @IsNotEmpty()
  @IsString()
  currency: string;

  /**
   * Amount in minor currency units as a string integer.
   * Losses (REALISED_TRADE_LOSS, WITHDRAWAL) should be negative values.
   */
  @IsNotEmpty()
  @IsString()
  amount: string;

  @IsOptional()
  @IsString()
  sourceReference?: string;

  @IsISO8601()
  @IsDateString()
  occurredAt: string;
}
