# Runbook — Sprint 18 Provider Transaction Reference Unique Guard

## Purpose

Migration `1751500000000-AddPaymentTransactionReferenceUniqueGuard` adds a
**partial unique index** on `payments.payment_transactions (provider, provider_transaction_reference)`
so that no two `PaymentTransaction` rows can ever share the same
`(provider, provider_transaction_reference)` pair.

This is a defence-in-depth guard. The application-level atomic-claim logic
(Sprint 16) already prevents two concurrent checkout requests from both
calling `provider.createCheckoutSession()` for the same transaction, and every
provider (Stripe, Paystack, Manual) requests a brand-new session/reference on
every call — so a legitimate collision should never occur. But if a bug or
race ever produces a duplicate reference, the `WebhookProcessorService` looks
up the transaction to mark paid by exactly this `(provider, providerTransactionReference)`
pair, so a collision could let a webhook for one transaction match/pay the
wrong row. The DB guard makes that impossible.

## The migration

```
File:   apps/api/src/database/migrations/1751500000000-AddPaymentTransactionReferenceUniqueGuard.ts
Index:  ux_payment_transactions_provider_reference
Scope:  WHERE provider_transaction_reference IS NOT NULL
        AND provider_transaction_reference <> ''
```

The `WHERE` clause excludes freshly-created `PENDING` transactions that have
not yet called the provider (their `provider_transaction_reference` is still
`NULL` or `''`). This means the guard only applies to real, non-empty provider
references — exactly the ones a webhook would look up.

## ⚠️ Pre-migration check (REQUIRED for databases with existing data)

This migration creates a `UNIQUE INDEX`. If any existing
`(provider, provider_transaction_reference)` pair is already duplicated in
the target database, `CREATE INDEX` will fail with a PostgreSQL `23505
unique_violation` and the migration will not apply.

**Before running this migration against any production / staging database
that contains real historical transaction data, run this check:**

```sql
SELECT provider, provider_transaction_reference, COUNT(*) AS dup_count
FROM payments.payment_transactions
WHERE provider_transaction_reference IS NOT NULL
  AND provider_transaction_reference <> ''
GROUP BY provider, provider_transaction_reference
HAVING COUNT(*) > 1;
```

### If the query returns 0 rows

The migration is safe to apply. Proceed:

```bash
pnpm --filter @irexpro/api migration:run -d src/database/data-source.ts
```

### If the query returns any rows

Do **NOT** apply the migration yet. Each duplicate pair must be investigated
and resolved manually first. Typical causes:

1. **An orphaned retry row** — a `PENDING` or `FAILED` transaction left behind
   by a crashed checkout that was retried with a new transaction but the same
   provider reference. Safe resolution: set the orphaned row's
   `provider_transaction_reference` back to `NULL` (so it is excluded from the
   unique index) or delete it if it is truly orphaned.

2. **A provider bug** — the provider returned the same session/reference id
   for two distinct `createCheckoutSession` calls. This should never happen
   with Stripe/Paystack (both issue fresh ids), but if it does, contact the
   provider and treat the older row as the canonical one.

3. **A manual data import / backfill error** — investigate the source and
   resolve per-row.

**Never** resolve duplicates by blindly deleting rows. Always preserve the
row that corresponds to the actually-paid transaction (the one with
`status = 'SUCCEEDED'` and a matching paid invoice). When in doubt, set the
non-canonical row's `provider_transaction_reference` to `NULL` rather than
deleting it — this keeps the audit trail intact while letting the unique
index apply.

After resolving all duplicates, re-run the check query above to confirm 0
rows, then apply the migration.

## What the migration does NOT do

- It does **not** delete or modify any existing data. It is purely additive
  (`CREATE UNIQUE INDEX IF NOT EXISTS`).
- It does **not** change any application logic. The 23505 handling in
  `SubscriptionsService` and `PerformanceFeePaymentService` already existed
  (Sprint 18 PART C) before this runbook was written.
- It does **not** affect `NULL` or empty-string references — those are
  excluded by the `WHERE` clause.

## Rollback

To revert the migration (drops the index only — no data change):

```bash
pnpm --filter @irexpro/api migration:revert -d src/database/data-source.ts
```

This drops `ux_payment_transactions_provider_reference`. The 23505 handling
in the checkout services will simply never fire (no unique constraint to
violate), but the application-level atomic-claim guards from Sprint 16
continue to prevent concurrent duplicate sessions.

## Related files

- `apps/api/src/database/migrations/1751500000000-AddPaymentTransactionReferenceUniqueGuard.ts`
- `apps/api/src/modules/subscriptions/subscriptions.service.ts` (23505 catch + release)
- `apps/api/src/modules/payments/services/performance-fee-payment.service.ts` (23505 catch + release)
- `apps/api/src/modules/payments/utils/db-error.util.ts` (`isUniqueViolation` classifier)
- `apps/api/src/modules/payments/services/webhook-processor.service.ts` (transaction lookup by provider + reference)
