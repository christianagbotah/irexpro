import { LedgerEntryType } from '../entities/performance-fee-ledger-entry.entity';
export declare class CreateLedgerEntryDto {
    userId: string;
    assessmentId?: string;
    brokerConnectionId?: string;
    entryType: LedgerEntryType;
    currency: string;
    amount: string;
    sourceReference?: string;
    occurredAt: string;
}
