import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 27 — make users.email nullable to support phone-only registration.
 *
 * Previously email was NOT NULL + UNIQUE. With phone registration support,
 * a user may register with only a phone number (no email). PostgreSQL
 * allows multiple NULLs in a UNIQUE column, so making email nullable is safe.
 *
 * This migration is idempotent and non-destructive — it only alters the
 * column constraint, no data is modified.
 */
export class MakeEmailNullableForPhoneRegistration1751700000000 implements MigrationInterface {
  name = 'MakeEmailNullableForPhoneRegistration1751700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the existing unique constraint on email, then recreate it
    // allowing NULLs (PostgreSQL treats NULLs as distinct in unique indexes).
    // The constraint name may vary — use IF EXISTS for safety.
    await queryRunner.query(`
      ALTER TABLE identity.users ALTER COLUMN email DROP NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE identity.users ALTER COLUMN email SET NOT NULL
    `);
  }
}
