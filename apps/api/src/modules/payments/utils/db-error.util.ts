import { QueryFailedError } from 'typeorm';

/**
 * True when `err` is a PostgreSQL `23505` (unique_violation) raised through
 * TypeORM. Used to detect a duplicate `providerTransactionReference` (or any
 * other DB-level uniqueness guard) so callers can fail closed with a
 * sanitized conflict instead of leaking a raw `QueryFailedError` (which may
 * echo back column values / constraint names) to the API response.
 */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505';
}
