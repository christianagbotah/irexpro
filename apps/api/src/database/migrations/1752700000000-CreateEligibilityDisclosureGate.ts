import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 44 — Eligibility & Disclosure Gate.
 *
 * Both tables are append-only evidence stores. Current eligibility is derived
 * from the active policy + country + latest matching immutable admin review;
 * current consent requires an exact disclosure key/version/content hash match.
 */
export class CreateEligibilityDisclosureGate1752700000000 implements MigrationInterface {
  name = 'CreateEligibilityDisclosureGate1752700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.user_disclosure_consents (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id             uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        disclosure_key      varchar(64) NOT NULL,
        disclosure_version  varchar(32) NOT NULL,
        content_sha256      varchar(64) NOT NULL,
        accepted_at         timestamptz NOT NULL DEFAULT NOW(),
        created_at          timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_user_disclosure_consents_hash
          CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
        CONSTRAINT chk_user_disclosure_consents_key
          CHECK (disclosure_key IN (
            'AUTOMATED_TRADING_RISK',
            'NO_PROFIT_GUARANTEE',
            'BROKER_EXECUTION_AUTHORITY',
            'LEGAL_ELIGIBILITY_ATTESTATION'
          ))
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_user_disclosure_consents_evidence
      ON identity.user_disclosure_consents (
        user_id,
        disclosure_key,
        disclosure_version,
        content_sha256
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_disclosure_consents_user
      ON identity.user_disclosure_consents (user_id, accepted_at ASC)
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.user_eligibility_reviews (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        country_code      varchar(2) NOT NULL,
        policy_version    varchar(64) NOT NULL,
        decision          varchar(20) NOT NULL,
        reason_code       varchar(64) NOT NULL,
        reviewer_user_id  uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        reviewer_note     text,
        created_at        timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_user_eligibility_reviews_country
          CHECK (country_code ~ '^[A-Z]{2}$'),
        CONSTRAINT chk_user_eligibility_reviews_decision
          CHECK (decision IN ('APPROVED', 'DENIED'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_eligibility_reviews_lookup
      ON identity.user_eligibility_reviews (
        user_id,
        country_code,
        policy_version,
        created_at DESC
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_user_eligibility_reviews_reviewer
      ON identity.user_eligibility_reviews (reviewer_user_id, created_at DESC)
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION identity.reject_eligibility_evidence_mutation()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      BEGIN
        RAISE EXCEPTION 'eligibility evidence is append-only and cannot be mutated'
          USING ERRCODE = '55000';
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_user_disclosure_consents_immutable
      BEFORE UPDATE OR DELETE OR TRUNCATE ON identity.user_disclosure_consents
      FOR EACH STATEMENT
      EXECUTE FUNCTION identity.reject_eligibility_evidence_mutation()
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_user_eligibility_reviews_immutable
      BEFORE UPDATE OR DELETE OR TRUNCATE ON identity.user_eligibility_reviews
      FOR EACH STATEMENT
      EXECUTE FUNCTION identity.reject_eligibility_evidence_mutation()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS identity.user_eligibility_reviews`);
    await queryRunner.query(`DROP TABLE IF EXISTS identity.user_disclosure_consents`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS identity.reject_eligibility_evidence_mutation()`);
  }
}
