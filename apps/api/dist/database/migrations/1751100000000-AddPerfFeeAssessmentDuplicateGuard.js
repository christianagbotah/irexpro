"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPerfFeeAssessmentDuplicateGuard1751100000000 = void 0;
class AddPerfFeeAssessmentDuplicateGuard1751100000000 {
    constructor() {
        this.name = 'AddPerfFeeAssessmentDuplicateGuard1751100000000';
    }
    async up(queryRunner) {
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pfa_unique_period_with_broker
        ON performance_fees.performance_fee_assessments
          (user_id, broker_connection_id, period_start, period_end)
        WHERE broker_connection_id IS NOT NULL
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pfa_unique_period_no_broker
        ON performance_fees.performance_fee_assessments
          (user_id, period_start, period_end)
        WHERE broker_connection_id IS NULL
    `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX IF EXISTS performance_fees.idx_pfa_unique_period_with_broker`);
        await queryRunner.query(`DROP INDEX IF EXISTS performance_fees.idx_pfa_unique_period_no_broker`);
    }
}
exports.AddPerfFeeAssessmentDuplicateGuard1751100000000 = AddPerfFeeAssessmentDuplicateGuard1751100000000;
//# sourceMappingURL=1751100000000-AddPerfFeeAssessmentDuplicateGuard.js.map