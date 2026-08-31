import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum EligibilityReviewDecision {
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
}

@Entity({ name: 'user_eligibility_reviews', schema: 'identity' })
@Index('idx_user_eligibility_reviews_lookup', [
  'userId',
  'countryCode',
  'policyVersion',
  'createdAt',
])
export class UserEligibilityReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2 })
  countryCode: string;

  @Column({ name: 'policy_version', type: 'varchar', length: 64 })
  policyVersion: string;

  @Column({ type: 'varchar', length: 20 })
  decision: EligibilityReviewDecision;

  @Column({ name: 'reason_code', type: 'varchar', length: 64 })
  reasonCode: string;

  @Column({ name: 'reviewer_user_id', type: 'uuid' })
  reviewerUserId: string;

  @Column({ name: 'reviewer_note', type: 'text', nullable: true })
  reviewerNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
