/**
 * bootstrap-admin.ts — CLI entry point for secure first-admin creation.
 *
 * Usage:
 *   pnpm --filter @irexpro/api seed:admin
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
 *
 * The script:
 *   1. Boots a minimal NestJS application context (no HTTP listener).
 *   2. Calls BootstrapAdminService.bootstrapSuperAdmin().
 *   3. Prints a safe summary (no password, no hash).
 *   4. Exits 0 on success, 1 on error.
 *
 * Idempotent: running twice is safe. Roles are find-or-create, user_roles are
 * find-or-create, and an existing SUPER_ADMIN user is left unchanged.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import configuration from '../src/config/configuration';
import { validationSchema } from '../src/config/validation.schema';
import { UsersModule } from '../src/modules/users/users.module';
import { BootstrapAdminService, BootstrapAdminInput } from '../src/modules/users/bootstrap-admin.service';

async function main() {
  const logger = new Logger('BootstrapAdmin');

  // Read admin details from env (never from argv)
  const input: BootstrapAdminInput = {
    email: process.env.BOOTSTRAP_ADMIN_EMAIL?.trim() || undefined,
    phone: process.env.BOOTSTRAP_ADMIN_PHONE?.trim() || undefined,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || '',
    firstName: process.env.BOOTSTRAP_ADMIN_FIRST_NAME?.trim() || undefined,
    lastName: process.env.BOOTSTRAP_ADMIN_LAST_NAME?.trim() || undefined,
    countryCode: process.env.BOOTSTRAP_ADMIN_COUNTRY_CODE?.trim() || undefined,
  };

  if (!input.email && !input.phone) {
    logger.error(
      'At least one of BOOTSTRAP_ADMIN_EMAIL or BOOTSTRAP_ADMIN_PHONE must be set.',
    );
    logger.error('Set them in .env on the VPS, then re-run: pnpm --filter @irexpro/api seed:admin');
    process.exit(1);
  }

  if (!input.password || input.password.length < 12) {
    logger.error('BOOTSTRAP_ADMIN_PASSWORD must be set and at least 12 characters.');
    process.exit(1);
  }

  // Build a minimal app context that only loads ConfigModule + TypeOrm + UsersModule.
  // This avoids booting the entire AppModule (no BullMQ, no Redis, no HTTP).
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

  const app = await NestFactory.createApplicationContext(BootstrapAppModule, {
    logger: ['log', 'error', 'warn'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  try {
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
    await app.close();
    process.exit(1);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal error during bootstrap:', err);
  process.exit(1);
});
