import { MigrationInterface, QueryRunner } from 'typeorm';

/** Sprint 48 — persistent temporary login lockout state. */
export class AddLoginAbuseProtection1753100000000 implements MigrationInterface {
  name = 'AddLoginAbuseProtection1753100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      ADD COLUMN IF NOT EXISTS "failed_login_attempts" integer
    `);

    await queryRunner.query(`
      UPDATE "identity"."users"
      SET "failed_login_attempts" = 0
      WHERE "failed_login_attempts" IS NULL OR "failed_login_attempts" < 0
    `);

    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      ALTER COLUMN "failed_login_attempts" SET DEFAULT 0,
      ALTER COLUMN "failed_login_attempts" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      ADD COLUMN IF NOT EXISTS "login_locked_until" timestamptz
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_users_failed_login_attempts_nonnegative'
            AND conrelid = '"identity"."users"'::regclass
        ) THEN
          ALTER TABLE "identity"."users"
          ADD CONSTRAINT "chk_users_failed_login_attempts_nonnegative"
          CHECK ("failed_login_attempts" >= 0);
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      DROP CONSTRAINT IF EXISTS "chk_users_failed_login_attempts_nonnegative"
    `);
    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      DROP COLUMN IF EXISTS "login_locked_until",
      DROP COLUMN IF EXISTS "failed_login_attempts"
    `);
  }
}
