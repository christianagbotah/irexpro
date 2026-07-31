import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 27 amendment — DB-level uniqueness guard on phone numbers.
 *
 * phone is nullable (multiple NULLs allowed). Non-null, non-empty phone
 * values must be unique at the database level. This backs the
 * service-level duplicate check in AuthService.register() with a hard
 * constraint so a race cannot create two users with the same phone.
 *
 * Partial unique index — only applies WHERE phone IS NOT NULL AND phone <> ''.
 * Idempotent: uses IF NOT EXISTS.
 *
 * Non-destructive: no data is modified. If duplicates already exist the
 * index creation will fail — run the duplicate-check query first.
 */
export class AddPhoneUniqueIndex1751800000000 implements MigrationInterface {
  name = 'AddPhoneUniqueIndex1751800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_users_phone
        ON identity.users (phone)
        WHERE phone IS NOT NULL AND phone <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS identity.ux_users_phone`);
  }
}
