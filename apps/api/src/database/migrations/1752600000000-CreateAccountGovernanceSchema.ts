import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 43 — Account Governance.
 *
 * Adds a durable, auditable account-appeal record without retaining a second
 * copy of a person's email or phone. The account-access status remains on
 * identity.users; this table stores only the appeal/review lifecycle.
 */
export class CreateAccountGovernanceSchema1752600000000 implements MigrationInterface {
  name = 'CreateAccountGovernanceSchema1752600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS identity.account_appeals (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id           uuid NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
        reason            text NOT NULL,
        status            varchar(20) NOT NULL DEFAULT 'PENDING',
        decision          varchar(30),
        reviewer_user_id  uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
        reviewer_note     text,
        resolved_at       timestamptz,
        created_at        timestamptz NOT NULL DEFAULT NOW(),
        updated_at        timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_account_appeals_status
          CHECK (status IN ('PENDING', 'RESOLVED')),
        CONSTRAINT chk_account_appeals_decision
          CHECK (decision IS NULL OR decision IN ('REACTIVATE', 'PERMANENTLY_LOCK', 'DELETE')),
        CONSTRAINT chk_account_appeals_resolution_shape
          CHECK (
            (status = 'PENDING' AND decision IS NULL AND reviewer_user_id IS NULL AND reviewer_note IS NULL AND resolved_at IS NULL)
            OR
            (status = 'RESOLVED' AND decision IS NOT NULL AND reviewer_user_id IS NOT NULL AND resolved_at IS NOT NULL)
          )
      )
    `);

    // There may be one historical resolved appeal, but at most one queued
    // request per account. This is also the concurrency backstop for the
    // generic public appeal endpoint.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_account_appeals_one_pending_per_user
      ON identity.account_appeals (user_id)
      WHERE status = 'PENDING'
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_account_appeals_user_status
      ON identity.account_appeals (user_id, status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_account_appeals_created_at
      ON identity.account_appeals (created_at ASC)
    `);

    // Fail with a clear diagnostic before adding the closed-domain constraint.
    // This keeps an unexpected historical status from surfacing as only a
    // generic PostgreSQL CHECK-violation during a production deployment.
    const unknownStatuses = await queryRunner.query(`
      SELECT DISTINCT status
      FROM identity.users
      WHERE status NOT IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'PERMANENTLY_LOCKED', 'CLOSED')
    `);
    if (unknownStatuses.length > 0) {
      throw new Error(
        `Cannot add chk_users_account_status; unexpected existing statuses: ${JSON.stringify(unknownStatuses)}`,
      );
    }

    // identity.users.status is deliberately a varchar in the baseline schema.
    // Add the new lock state with a check constraint rather than changing
    // storage to a PostgreSQL enum, which keeps the migration additive.
    await queryRunner.query(`
      ALTER TABLE identity.users
      ADD CONSTRAINT chk_users_account_status
      CHECK (status IN ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'PERMANENTLY_LOCKED', 'CLOSED'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE identity.users DROP CONSTRAINT IF EXISTS chk_users_account_status`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS identity.account_appeals`);
  }
}
