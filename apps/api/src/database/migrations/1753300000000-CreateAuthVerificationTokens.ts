import { MigrationInterface, QueryRunner } from 'typeorm';

/** Sprint 48 — single-use hashed email/phone verification challenges. */
export class CreateAuthVerificationTokens1753300000000 implements MigrationInterface {
  name = 'CreateAuthVerificationTokens1753300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "identity"."auth_verification_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" varchar(64) NOT NULL,
        "channel" varchar(10) NOT NULL,
        "expires_at" timestamptz NOT NULL,
        "used_at" timestamptz NULL,
        "requested_ip" varchar(45) NULL,
        "user_agent" varchar(500) NULL,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_auth_verification_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "fk_auth_verification_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE CASCADE,
        CONSTRAINT "chk_auth_verification_tokens_channel"
          CHECK ("channel" IN ('EMAIL', 'PHONE')),
        CONSTRAINT "chk_auth_verification_tokens_attempt_count"
          CHECK ("attempt_count" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_avt_user_channel"
      ON "identity"."auth_verification_tokens" ("user_id", "channel")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_avt_token_hash"
      ON "identity"."auth_verification_tokens" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_avt_expires_at"
      ON "identity"."auth_verification_tokens" ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "identity"."auth_verification_tokens"`);
  }
}
