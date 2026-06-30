import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 12 PART A hardening — DB-level duplicate assessment guard.
 *
 * Adds two partial unique indexes to performance_fee_assessments so that
 * the database enforces the "one assessment per user/broker/period" rule
 * even if the app-level check races.
 *
 * Why two partial indexes instead of one full unique index?
 * PostgreSQL treats NULL != NULL in a standard UNIQUE constraint, so two rows
 * with broker_connection_id = NULL and the same (user_id, period_start,
 * period_end) would NOT be caught by a single UNIQUE on all four columns.
 * A partial index on "WHERE broker_connection_id IS NULL" solves this safely.
 *
 * Safe for existing data: IF NOT EXISTS guards are idempotent.
 */
export class AddPerfFeeAssessmentDuplicateGuard1751100000000 implements MigrationInterface {
  name = 'AddPerfFeeAssessmentDuplicateGuard1751100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Partial unique index for assessments tied to a specific broker connection
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pfa_unique_period_with_broker
        ON performance_fees.performance_fee_assessments
          (user_id, broker_connection_id, period_start, period_end)
        WHERE broker_connection_id IS NOT NULL
    `);

    // Partial unique index for assessments with no broker connection (global scope)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pfa_unique_period_no_broker
        ON performance_fees.performance_fee_assessments
          (user_id, period_start, period_end)
        WHERE broker_connection_id IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS performance_fees.idx_pfa_unique_period_with_broker`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS performance_fees.idx_pfa_unique_period_no_broker`,
    );
  }
}
