import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 45 — Age & KYC Readiness Gate.
 *
 * Reuses the existing identity.user_profiles.date_of_birth and kyc_* columns.
 * This migration adds only the append-only reviewer evidence ledger.
 */
export class CreateAgeKycReadinessGate1752800000000 implements MigrationInterface {
  name = 'CreateAgeKycReadinessGate1752800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.user_kyc_reviews (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        date_of_birth     date NOT NULL,
        decision          varchar(20) NOT NULL,
        reason_code       varchar(64) NOT NULL,
        reviewer_user_id  uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        reviewer_note     text,
        created_at        timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_user_kyc_reviews_decision
          CHECK (decision IN ('APPROVED', 'REJECTED'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_kyc_reviews_lookup
      ON identity.user_kyc_reviews (user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_kyc_reviews_reviewer
      ON identity.user_kyc_reviews (reviewer_user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION identity.reject_kyc_evidence_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'KYC review evidence is append-only and cannot be mutated'
          USING ERRCODE = '55000';
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_user_kyc_reviews_immutable
      BEFORE UPDATE OR DELETE OR TRUNCATE ON identity.user_kyc_reviews
      FOR EACH STATEMENT
      EXECUTE FUNCTION identity.reject_kyc_evidence_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS identity.user_kyc_reviews`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS identity.reject_kyc_evidence_mutation()`);
  }
}
