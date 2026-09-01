import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum KycReviewDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

@Entity({ name: 'user_kyc_reviews', schema: 'identity' })
@Index('idx_user_kyc_reviews_lookup', ['userId', 'dateOfBirth', 'createdAt'])
export class UserKycReview {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'date_of_birth', type: 'date' })
  dateOfBirth: string;

  @Column({ type: 'varchar', length: 20 })
  decision: KycReviewDecision;

  @Column({ name: 'reason_code', type: 'varchar', length: 64 })
  reasonCode: string;

  @Column({ name: 'reviewer_user_id', type: 'uuid' })
  reviewerUserId: string;

  @Column({ name: 'reviewer_note', type: 'text', nullable: true })
  reviewerNote: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
