"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPaymentTransactionReferenceUniqueGuard1751500000000 = void 0;
class AddPaymentTransactionReferenceUniqueGuard1751500000000 {
    constructor() {
        this.name = 'AddPaymentTransactionReferenceUniqueGuard1751500000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_transactions_provider_reference
        ON payments.payment_transactions (provider, provider_transaction_reference)
        WHERE provider_transaction_reference IS NOT NULL
          AND provider_transaction_reference <> ''
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS payments.ux_payment_transactions_provider_reference`);
    }
}
exports.AddPaymentTransactionReferenceUniqueGuard1751500000000 = AddPaymentTransactionReferenceUniqueGuard1751500000000;
//# sourceMappingURL=1751500000000-AddPaymentTransactionReferenceUniqueGuard.js.map