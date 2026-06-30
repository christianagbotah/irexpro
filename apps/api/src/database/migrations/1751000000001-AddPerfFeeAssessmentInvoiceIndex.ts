import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 11 audit fix — add an index on performance_fee_assessments.invoice_id.
 *
 * The performance fee payment flow (markAssessmentPaid / webhook handler) looks up
 * the assessment by invoiceId on every PERFORMANCE_FEE payment webhook. This index
 * keeps that lookup efficient as the table grows.
 *
 * Idempotent: uses IF NOT EXISTS so it is safe on databases where the index was
 * already created by the (updated) base migration.
 */
export class AddPerfFeeAssessmentInvoiceIndex1751000000001 implements MigrationInterface {
  name = 'AddPerfFeeAssessmentInvoiceIndex1751000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_pfa_invoice_id
        ON performance_fees.performance_fee_assessments (invoice_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS performance_fees.idx_pfa_invoice_id`);
  }
}
