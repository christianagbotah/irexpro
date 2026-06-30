import { MigrationInterface, QueryRunner } from 'typeorm';
export declare class AddPerfFeeAssessmentInvoiceIndex1751000000001 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
