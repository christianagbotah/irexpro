import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 16 PART D — DB-level duplicate subscription-checkout guard.
 *
 * Problem: SubscriptionsService.initiateCheckout() used to create a brand-new
 * DRAFT invoice + PENDING PaymentTransaction on every call, so a double-click
 * or two concurrent checkout requests for the same (userId, planId, currency,
 * countryCode, paymentPurpose) could create multiple parallel pending
 * invoices/transactions.
 *
 * App-level fix (see SubscriptionsService.findReusableCheckout): before
 * creating a new invoice, the service searches for an existing DRAFT/ISSUED
 * subscription invoice for the same identity and reuses it. This closes the
 * race in the common case, but two requests racing through the "not found"
 * check at the same time could still both attempt an INSERT.
 *
 * This migration adds the authoritative DB-level guard: a partial unique
 * index on invoices scoped to subscription checkouts (metadata->>'type' =
 * 'SUBSCRIPTION') that are still pending (DRAFT/ISSUED). Postgres enforces
 * at most one such invoice per (user_id, currency, planId, countryCode,
 * paymentPurpose) tuple. A losing concurrent INSERT gets a 23505
 * unique_violation, which SubscriptionsService.createInvoiceAndTransaction()
 * catches and safely resolves by re-reading and reusing the winning
 * invoice/transaction instead of surfacing a raw DB error or creating an
 * orphaned transaction.
 *
 * Why a partial index instead of a plain UNIQUE constraint?
 * The identity fields (planId, countryCode, paymentPurpose) live in the
 * invoices.metadata JSONB column, not dedicated columns — Postgres supports
 * unique indexes on JSONB expressions directly, so no new columns or backfill
 * are required. The index only applies to still-pending subscription
 * invoices (WHERE clause), so paid/void/cancelled invoices and performance-fee
 * invoices (metadata->>'type' <> 'SUBSCRIPTION') are never affected.
 *
 * Safe for existing data: IF NOT EXISTS is idempotent, and the predicate only
 * matches rows created by the Sprint 16+ subscription checkout flow (which
 * always sets metadata.type = 'SUBSCRIPTION').
 */
export class AddSubscriptionCheckoutDuplicateGuard1751400000000 implements MigrationInterface {
  name = 'AddSubscriptionCheckoutDuplicateGuard1751400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_inv_unique_pending_subscription_checkout
        ON payments.invoices (
          user_id,
          currency,
          (metadata->>'planId'),
          (metadata->>'countryCode'),
          (metadata->>'paymentPurpose')
        )
        WHERE status IN ('DRAFT', 'ISSUED') AND (metadata->>'type') = 'SUBSCRIPTION'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS payments.idx_inv_unique_pending_subscription_checkout`,
    );
  }
}
