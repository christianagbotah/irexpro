import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 28 — Create identity.password_reset_tokens table.
 *
 * Stores ONLY the hash of the password reset token/code (never the raw value).
 * Used by POST /auth/forgot-password and POST /auth/reset-password.
 *
 * Security properties:
 *   - token_hash: SHA-256 hash (raw token never persisted)
 *   - expires_at: enforced by the service layer (15 min email, 10 min phone)
 *   - used_at: single-use enforcement (non-null = consumed)
 *   - attempt_count: phone code abuse guard (max 5 attempts)
 *
 * Indexes: user_id (lookup + invalidation of prior tokens), token_hash
 * (verification lookup), expires_at (cleanup of expired tokens).
 *
 * Non-destructive: uses IF NOT EXISTS. The identity schema already exists
 * (created by the baseline migration 1750800000000).
 */
export class CreatePasswordResetTokens1751900000000 implements MigrationInterface {
  name = 'CreatePasswordResetTokens1751900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "identity"."password_reset_tokens" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar(255) NOT NULL,
        "channel" varchar(10) NOT NULL,
        "destination_hash" varchar(255),
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz,
        "requested_at" timestamptz NOT NULL DEFAULT now(),
        "requested_ip" varchar(45),
        "user_agent" varchar(500),
        "attempt_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_prt_user_id" ON "identity"."password_reset_tokens" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_prt_token_hash" ON "identity"."password_reset_tokens" ("token_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_prt_expires_at" ON "identity"."password_reset_tokens" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "identity"."password_reset_tokens"`);
  }
}
