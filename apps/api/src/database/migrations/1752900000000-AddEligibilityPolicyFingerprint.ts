import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 46 — Policy Fingerprint & Re-consent Governance.
 *
 * Existing evidence is intentionally marked legacy/unbound rather than updated
 * to the active policy. The eligibility service matches only the current
 * version + SHA-256 policy fingerprint, so legacy rows fail closed until new
 * immutable evidence is recorded.
 *
 * This migration performs DDL only. It never UPDATEs, DELETEs, or TRUNCATEs the
 * append-only evidence tables and therefore does not bypass their immutability
 * triggers.
 */
export class AddEligibilityPolicyFingerprint1752900000000 implements MigrationInterface {
  name = 'AddEligibilityPolicyFingerprint1752900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      ADD COLUMN IF NOT EXISTS policy_version varchar(64) NOT NULL DEFAULT 'legacy.unbound'
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      ADD COLUMN IF NOT EXISTS policy_fingerprint varchar(64) NOT NULL DEFAULT '${'0'.repeat(64)}'
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      ALTER COLUMN policy_version DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      ALTER COLUMN policy_fingerprint DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      DROP CONSTRAINT IF EXISTS chk_user_disclosure_consents_policy_fingerprint
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      ADD CONSTRAINT chk_user_disclosure_consents_policy_fingerprint
      CHECK (policy_fingerprint ~ '^[a-f0-9]{64}$')
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS identity.uq_user_disclosure_consents_evidence`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_user_disclosure_consents_evidence
      ON identity.user_disclosure_consents (
        user_id,
        policy_version,
        policy_fingerprint,
        disclosure_key,
        disclosure_version,
        content_sha256
      )
    `);

    await queryRunner.query(`
      ALTER TABLE identity.user_eligibility_reviews
      ADD COLUMN IF NOT EXISTS policy_fingerprint varchar(64) NOT NULL DEFAULT '${'0'.repeat(64)}'
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_eligibility_reviews
      ALTER COLUMN policy_fingerprint DROP DEFAULT
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_eligibility_reviews
      DROP CONSTRAINT IF EXISTS chk_user_eligibility_reviews_policy_fingerprint
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_eligibility_reviews
      ADD CONSTRAINT chk_user_eligibility_reviews_policy_fingerprint
      CHECK (policy_fingerprint ~ '^[a-f0-9]{64}$')
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS identity.idx_user_eligibility_reviews_lookup`);
    await queryRunner.query(`
      CREATE INDEX idx_user_eligibility_reviews_lookup
      ON identity.user_eligibility_reviews (
        user_id,
        country_code,
        policy_version,
        policy_fingerprint,
        created_at DESC
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS identity.idx_user_eligibility_reviews_lookup`);
    await queryRunner.query(`
      CREATE INDEX idx_user_eligibility_reviews_lookup
      ON identity.user_eligibility_reviews (
        user_id,
        country_code,
        policy_version,
        created_at DESC
      )
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_eligibility_reviews
      DROP CONSTRAINT IF EXISTS chk_user_eligibility_reviews_policy_fingerprint
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_eligibility_reviews
      DROP COLUMN IF EXISTS policy_fingerprint
    `);

    await queryRunner.query(`DROP INDEX IF EXISTS identity.uq_user_disclosure_consents_evidence`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX uq_user_disclosure_consents_evidence
      ON identity.user_disclosure_consents (
        user_id,
        disclosure_key,
        disclosure_version,
        content_sha256
      )
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      DROP CONSTRAINT IF EXISTS chk_user_disclosure_consents_policy_fingerprint
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      DROP COLUMN IF EXISTS policy_fingerprint
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_disclosure_consents
      DROP COLUMN IF EXISTS policy_version
    `);
  }
}
