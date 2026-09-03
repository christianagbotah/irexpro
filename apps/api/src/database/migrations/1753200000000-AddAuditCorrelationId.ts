import { MigrationInterface, QueryRunner } from 'typeorm';

/** Sprint 48 — add server request correlation to persisted audit evidence. */
export class AddAuditCorrelationId1753200000000 implements MigrationInterface {
  name = 'AddAuditCorrelationId1753200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "audit"."audit_logs"
      ADD COLUMN IF NOT EXISTS "correlation_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_correlation_id"
      ON "audit"."audit_logs" ("correlation_id")
      WHERE "correlation_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "audit"."idx_audit_logs_correlation_id"
    `);
    await queryRunner.query(`
      ALTER TABLE "audit"."audit_logs"
      DROP COLUMN IF EXISTS "correlation_id"
    `);
  }
}
