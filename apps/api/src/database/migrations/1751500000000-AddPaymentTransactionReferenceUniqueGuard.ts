import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 18 PART B — DB-level uniqueness guard on payment_transactions
 * (provider, provider_transaction_reference).
 *
 * Problem (Sprint 17 audit observation): `payment_transactions` only had a
 * plain (non-unique) index on `(provider, provider_transaction_reference)`
 * (see CreatePaymentsSchema1750900000000). Nothing at the database level
 * prevented two distinct PaymentTransaction rows from ending up with the same
 * provider + reference pair. In practice this can only happen through a bug
 * (a provider issuing a colliding session/reference id) or a race condition
 * that slips past the application-level atomic-claim guards added in
 * Sprint 16 (`UPDATE ... WHERE status IN (PENDING, FAILED)` before ever
 * calling the provider) — but if it ever did happen, `WebhookProcessorService`
 * looks up the transaction to mark paid by exactly this
 * `(provider, providerTransactionReference)` pair, so a collision could let a
 * webhook for one transaction match/pay the wrong row.
 *
 * Fix: a partial unique index that only applies to real, non-empty provider
 * references. Rows with a NULL or empty-string reference (freshly-created
 * PENDING transactions that have not yet called the provider) are excluded by
 * the WHERE clause — Postgres already treats NULL as distinct from every
 * other value in a unique index, so excluding NULL explicitly here is just
 * documentation of that behaviour, and excluding `''` covers any accidental
 * empty-string writes the same way.
 *
 * Why `manual` is NOT excluded:
 * `ManualPaymentProvider.createCheckoutSession()` (DEV/TEST only) always
 * generates a fresh `manual_session_${uuidv4()}` reference on every call —
 * see `apps/api/src/modules/payments/providers/manual.provider.ts`. It never
 * reuses a placeholder reference across transactions, so there is no
 * legitimate reason for two `manual` rows to ever collide, and excluding
 * `manual` from this guard would just be a needless carve-out for a bug that
 * cannot occur under the current implementation. If a future change to
 * ManualPaymentProvider ever introduces a fixed/reusable placeholder
 * reference, this index (and the DEV/TEST provider itself) would need to be
 * revisited together.
 *
 * Why not exclude Stripe/Paystack either:
 * Both `StripePaymentProvider` and `PaystackPaymentProvider` always request a
 * brand-new session/reference from the provider (Checkout Session id / a
 * fresh client-generated Paystack reference) on every `createCheckoutSession`
 * call — Sprint 16's "reuse an existing active session" path never calls
 * `createCheckoutSession` a second time for the same transaction, so a
 * legitimate reference is never intentionally duplicated across two
 * transaction rows for either provider.
 *
 * Operational note for production deployment:
 * This migration will fail with a 23505 unique_violation at CREATE INDEX time
 * if any existing (provider, provider_transaction_reference) pair is already
 * duplicated in the target database. Before running this migration against a
 * production/staging database with real historical data, operators should
 * first run:
 *
 *   SELECT provider, provider_transaction_reference, COUNT(*)
 *   FROM payments.payment_transactions
 *   WHERE provider_transaction_reference IS NOT NULL
 *     AND provider_transaction_reference <> ''
 *   GROUP BY provider, provider_transaction_reference
 *   HAVING COUNT(*) > 1;
 *
 * and manually investigate/resolve any rows returned (e.g. an orphaned retry
 * row) before applying this migration. This migration intentionally does NOT
 * perform any destructive cleanup of existing data — see Sprint 18 safety
 * rules (no deletion/modification of existing payment records).
 */
export class AddPaymentTransactionReferenceUniqueGuard1751500000000 implements MigrationInterface {
  name = 'AddPaymentTransactionReferenceUniqueGuard1751500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_provider_reference
        ON payments.payment_transactions (provider, provider_transaction_reference)
        WHERE provider_transaction_reference IS NOT NULL
          AND provider_transaction_reference <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS payments.ux_payment_transactions_provider_reference`,
    );
  }
}
