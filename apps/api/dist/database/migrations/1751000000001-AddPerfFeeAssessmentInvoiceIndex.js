"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPerfFeeAssessmentInvoiceIndex1751000000001 = void 0;
class AddPerfFeeAssessmentInvoiceIndex1751000000001 {
    constructor() {
        this.name = 'AddPerfFeeAssessmentInvoiceIndex1751000000001';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_invoice_id
        ON performance_fees.performance_fee_assessments (invoice_id)
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS performance_fees.idx_pfa_invoice_id`);
    }
}
exports.AddPerfFeeAssessmentInvoiceIndex1751000000001 = AddPerfFeeAssessmentInvoiceIndex1751000000001;
//# sourceMappingURL=1751000000001-AddPerfFeeAssessmentInvoiceIndex.js.map