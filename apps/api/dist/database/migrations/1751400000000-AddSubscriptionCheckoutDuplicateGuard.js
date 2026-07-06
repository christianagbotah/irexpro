"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddSubscriptionCheckoutDuplicateGuard1751400000000 = void 0;
class AddSubscriptionCheckoutDuplicateGuard1751400000000 {
    constructor() {
        this.name = 'AddSubscriptionCheckoutDuplicateGuard1751400000000';
    }
    async up(queryRunner) {
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
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS payments.idx_inv_unique_pending_subscription_checkout`);
    }
}
exports.AddSubscriptionCheckoutDuplicateGuard1751400000000 = AddSubscriptionCheckoutDuplicateGuard1751400000000;
//# sourceMappingURL=1751400000000-AddSubscriptionCheckoutDuplicateGuard.js.map