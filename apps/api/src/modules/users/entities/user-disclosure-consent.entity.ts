import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum EligibilityDisclosureKey {
  AUTOMATED_TRADING_RISK = 'AUTOMATED_TRADING_RISK',
  NO_PROFIT_GUARANTEE = 'NO_PROFIT_GUARANTEE',
  BROKER_EXECUTION_AUTHORITY = 'BROKER_EXECUTION_AUTHORITY',
  LEGAL_ELIGIBILITY_ATTESTATION = 'LEGAL_ELIGIBILITY_ATTESTATION',
}

@Entity({ name: 'user_disclosure_consents', schema: 'identity' })
@Index('idx_user_disclosure_consents_user', ['userId', 'acceptedAt'])
@Index(
  'uq_user_disclosure_consents_evidence',
  [
    'userId',
    'policyVersion',
    'policyFingerprint',
    'disclosureKey',
    'disclosureVersion',
    'contentSha256',
  ],
  { unique: true },
)
export class UserDisclosureConsent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'policy_version', type: 'varchar', length: 64 })
  policyVersion: string;

  @Column({ name: 'policy_fingerprint', type: 'varchar', length: 64 })
  policyFingerprint: string;

  @Column({ name: 'disclosure_key', type: 'varchar', length: 64 })
  disclosureKey: EligibilityDisclosureKey;

  @Column({ name: 'disclosure_version', type: 'varchar', length: 32 })
  disclosureVersion: string;

  @Column({ name: 'content_sha256', type: 'varchar', length: 64 })
  contentSha256: string;

  @Column({ name: 'accepted_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  acceptedAt: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
