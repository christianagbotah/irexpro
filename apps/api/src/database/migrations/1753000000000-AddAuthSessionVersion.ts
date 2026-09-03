import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 48 — server-side JWT revocation generation.
 *
 * Existing JWTs were stateless and could not be invalidated by logout or a
 * password reset. This migration gives every user a server-side generation
 * counter. Newly issued JWTs carry the counter and JwtStrategy verifies it on
 * every authenticated request.
 *
 * The baseline is deliberately 1. Pre-migration JWTs carry no generation and
 * are interpreted by the application as version 0, forcing a one-time login
 * after deployment instead of silently preserving old sessions.
 */
export class AddAuthSessionVersion1753000000000 implements MigrationInterface {
  name = 'AddAuthSessionVersion1753000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      ADD COLUMN IF NOT EXISTS "session_version" integer
    `);

    await queryRunner.query(`
      UPDATE "identity"."users"
      SET "session_version" = 1
      WHERE "session_version" IS NULL OR "session_version" < 1
    `);

    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      ALTER COLUMN "session_version" SET DEFAULT 1,
      ALTER COLUMN "session_version" SET NOT NULL
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'chk_users_session_version_positive'
            AND conrelid = '"identity"."users"'::regclass
        ) THEN
          ALTER TABLE "identity"."users"
          ADD CONSTRAINT "chk_users_session_version_positive"
          CHECK ("session_version" >= 1);
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      DROP CONSTRAINT IF EXISTS "chk_users_session_version_positive"
    `);
    await queryRunner.query(`
      ALTER TABLE "identity"."users"
      DROP COLUMN IF EXISTS "session_version"
    `);
  }
}
