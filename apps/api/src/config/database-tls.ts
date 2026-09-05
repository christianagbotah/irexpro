export type DatabaseSslOptions = false | { rejectUnauthorized: true };

/**
 * Build the PostgreSQL TLS option used by TypeORM.
 *
 * TLS remains opt-in through DB_SSL. Once it is enabled, certificate
 * verification is mandatory; do not silently downgrade to encrypted-but-
 * unauthenticated transport.
 */
export function getDatabaseSslOptions(enabled: boolean | undefined): DatabaseSslOptions {
  return enabled ? { rejectUnauthorized: true } : false;
}
