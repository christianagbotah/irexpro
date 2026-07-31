/**
 * bootstrap-admin.ts — CLI entry point for secure first-admin creation.
 *
 * Usage:
 *   pnpm --filter @irexpro/api seed:admin
 *
 * Dry-run mode (validates env + initializes app context, does NOT write to DB):
 *   BOOTSTRAP_ADMIN_DRY_RUN=true pnpm --filter @irexpro/api seed:admin
 *
 * This script reads admin details from environment variables ONLY — it never
 * accepts credentials on the command line (which would leak them in shell
 * history / process listings). It is intended to be run manually on the VPS
 * by a trusted operator.
 *
 * Required environment variables:
 *   BOOTSTRAP_ADMIN_PASSWORD  (min 12 chars, must contain letters + numbers)
 *   JWT_SECRET                (required by the app config validation)
 *   COOKIE_SECRET             (required by the app config validation)
 *   BROKER_ENCRYPTION_KEY     (required by the app config validation)
 *   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD  (database connection)
 *
 * Optional environment variables (at least one of email/phone is required):
 *   BOOTSTRAP_ADMIN_EMAIL
 *   BOOTSTRAP_ADMIN_PHONE
 *   BOOTSTRAP_ADMIN_FIRST_NAME
 *   BOOTSTRAP_ADMIN_LAST_NAME
 *   BOOTSTRAP_ADMIN_COUNTRY_CODE   (e.g. GH, NG, US)
 *   BOOTSTRAP_ADMIN_DRY_RUN        (set to "true" for a safe no-write verification)
 *
 * The script:
 *   1. Reads + validates admin details from env (explicit validation, NOT a
 *      NestJS ValidationPipe — INestApplicationContext does not support
 *      useGlobalPipes, and validation belongs in the service/CLI, not the
 *      HTTP pipeline).
 *   2. Boots a minimal NestJS application context (no HTTP listener).
 *   3. In dry-run mode: prints a safe summary and exits without calling the
 *      service's write path.
 *   4. In normal mode: calls BootstrapAdminService.bootstrapSuperAdmin().
 *   5. Prints a safe summary (no password, no hash).
 *   6. Closes the app context properly in BOTH success and failure cases.
 *   7. Exits 0 on success, 1 on error.
 *
 * Idempotent: running twice is safe. Roles are find-or-create, user_roles are
 * find-or-create, and an existing SUPER_ADMIN user is left unchanged.
 *
 * Hotfix: the previous version called app.useGlobalPipes(new ValidationPipe(...))
 * on the INestApplicationContext returned by NestFactory.createApplicationContext().
 * That method does NOT exist on INestApplicationContext — it only exists on
 * INestApplication (HTTP apps). This caused a TypeScript compile error
 * (TS2339: Property 'useGlobalPipes' does not exist on type
 * 'INestApplicationContext') and the script could not run under ts-node.
 * The fix removes useGlobalPipes entirely — validation is done explicitly in
 * validateBootstrapInput() and BootstrapAdminService.validateInput().
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from '../src/config/configuration';
import { validationSchema } from '../src/config/validation.schema';
import { UsersModule } from '../src/modules/users/users.module';
import {
  BootstrapAdminService,
  BootstrapAdminInput,
  validateBootstrapInput,
} from '../src/modules/users/bootstrap-admin.service';

/**
 * Read admin details from environment variables (never from argv).
 * Returns undefined values for missing optional fields.
 */
function readInputFromEnv(): BootstrapAdminInput {
  return {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || undefined,
    phone: process.env.BOOTSTRAP_ADMIN_PHONE?.trim() || undefined,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
    firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || undefined,
    lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || undefined,
    countryCode: process.env.BOOTSTRAP_ADMIN_COUNTRY_CODE?.trim() || undefined,
  };
}

async function main() {
  const logger = new Logger('BootstrapAdmin');
  const isDryRun = process.env.BOOTSTRAP_ADMIN_DRY_RUN === 'true';

  if (isDryRun) {
    logger.log('DRY-RUN mode active — no DB writes will be performed.');
  }

  // 1. Read + validate input BEFORE booting Nest (fail fast on bad env).
  //    This does NOT use a ValidationPipe — it's an explicit function that
  //    works in any context (CLI, service, tests).
  const input = readInputFromEnv();

  let inputErrors: string[] = [];
  try {
    validateBootstrapInput(input);
  } catch (err) {
    // Collect the error message; we'll print it and exit after the env summary
    inputErrors = [(err as Error).message];
  }

  if (inputErrors.length > 0) {
    for (const msg of inputErrors) {
      logger.error(msg);
    }
    logger.error('Set the required env vars in .env on the VPS, then re-run: pnpm --filter @irexpro/api seed:admin');
    logger.error('For a safe validation-only run, set BOOTSTRAP_ADMIN_DRY_RUN=true');
    process.exit(1);
  }

  // 2. Build a minimal app context that only loads ConfigModule + TypeOrm + UsersModule.
  //    This avoids booting the entire AppModule (no BullMQ, no Redis, no HTTP).
  @Module({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        load: [configuration],
        validationSchema,
        validationOptions: { abortEarly: false },
      }),
      TypeOrmModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: () => ({
          type: 'postgres',
          host: process.env.DB_HOST ?? 'localhost',
          port: parseInt(process.env.DB_PORT ?? '5432', 10),
          database: process.env.DB_NAME ?? 'irexpro_dev',
          username: process.env.DB_USER ?? 'irexpro',
          password: process.env.DB_PASSWORD,
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
          synchronize: false,
          logging: false,
          autoLoadEntities: true,
          extra: { max: parseInt(process.env.DB_MAX_CONNECTIONS ?? '10', 10) },
        }),
      }),
      UsersModule,
    ],
  })
  class BootstrapAppModule {}

  // NestFactory.createApplicationContext returns INestApplicationContext.
  // NOTE: INestApplicationContext does NOT have useGlobalPipes() — that method
  // only exists on INestApplication (HTTP apps). Validation is done explicitly
  // via validateBootstrapInput() + BootstrapAdminService.validateInput().
  const app = await NestFactory.createApplicationContext(BootstrapAppModule, {
    logger: ['log', 'error', 'warn'],
  });

  try {
    // In dry-run mode, we've validated the input and booted the context
    // successfully — that's all we need to do. Do NOT call the service.
    if (isDryRun) {
      logger.log('─'.repeat(60));
      logger.log('Dry-run validation passed. Input summary:');
      logger.log(`  Email        : ${input.email ?? '(not set)'}`);
      logger.log(`  Phone        : ${input.phone ?? '(not set)'}`);
      logger.log(`  First name   : ${input.firstName ?? '(not set)'}`);
      logger.log(`  Last name    : ${input.lastName ?? '(not set)'}`);
      logger.log(`  Country code : ${input.countryCode ?? '(not set)'}`);
      logger.log(`  Password     : [set, length ${input.password.length}] (not printed)`);
      logger.log('─'.repeat(60));
      logger.log('✓ Dry-run complete. No DB records were created or modified.');
      logger.log('  To create the admin, re-run without BOOTSTRAP_ADMIN_DRY_RUN.');
      logger.log('─'.repeat(60));
      await app.close();
      process.exit(0);
    }

    // Normal mode — call the service to create/promote the SUPER_ADMIN.
    const bootstrapService = app.get(BootstrapAdminService);
    const result = await bootstrapService.bootstrapSuperAdmin(input);

    logger.log('─'.repeat(60));
    logger.log('Bootstrap admin result:');
    logger.log(`  User ID : ${result.userId}`);
    logger.log(`  Email   : ${result.email ?? '(none)'}`);
    logger.log(`  Phone   : ${result.phone ?? '(none)'}`);
    logger.log(`  Action  : ${result.action}`);
    logger.log('─'.repeat(60));
    if (result.action === 'created') {
      logger.log('✓ New SUPER_ADMIN user created. They can now sign in at /admin/login.');
    } else if (result.action === 'promoted') {
      logger.log('✓ Existing user promoted to SUPER_ADMIN. Their password was NOT changed.');
    } else {
      logger.log('✓ User was already SUPER_ADMIN. No changes made.');
    }
    logger.log('The raw password was NOT logged and is NOT stored in plaintext.');
    logger.log('─'.repeat(60));

    await app.close();
    process.exit(0);
  } catch (err) {
    logger.error('Bootstrap failed:');
    logger.error((err as Error).message);
    if ((err as Error).stack) {
      logger.debug((err as Error).stack);
    }
    // Ensure the app context is always closed, even on error.
    await app.close();
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
