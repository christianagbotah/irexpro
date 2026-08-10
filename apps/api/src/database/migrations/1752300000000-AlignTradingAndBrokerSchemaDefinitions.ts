import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 29 — Database Schema Hardening Phase 1
 *
 * Aligns trading.trades and broker.broker_connections column definitions
 * to match entity metadata, using NON-DESTRUCTIVE widening only.
 *
 * Changes:
 *   1. trading.trades.lot_size: numeric(8,4) → numeric(10,4)
 *      Entity declares numeric(10,4); DB was narrower. Widening is safe —
 *      existing values (max 9999.9999) fit in the wider type.
 *
 *   2. broker.broker_connections.encryption_key_id: varchar(100) → varchar(255)
 *      Entity declares varchar(255); DB was narrower. Widening is safe —
 *      existing values (e.g. 'env-key-v1', 12 chars) fit in the wider type.
 *
 * NOT changed (DB is already wider than entity — entity metadata will be
 * aligned in a separate commit, not via destructive ALTER):
 *   - trading.trades.realised_pnl: DB numeric(18,8) vs entity numeric(15,2)
 *   - trading.trades.{requested_entry_price, fill_price, stop_loss,
 *     take_profit, exit_price}: DB numeric(18,8) vs entity numeric(15,5)
 *   - trading.trades.instrument: DB varchar(50) vs entity varchar(20)
 *   - trading.trades.idempotency_key: DB varchar(255) vs entity varchar(64)
 *   - trading.trades.external_order_id: DB varchar(255) vs entity varchar(100)
 *
 * Per architect Rule 2: NEVER narrow financial precision. Where DB is wider,
 * align entity metadata upward rather than narrowing the DB column.
 *
 * down() design: reverses the widening only if existing values fit the
 * narrower type. If any value exceeds the old limit, throws an error
 * (fail-closed) rather than silently truncating.
 */
export class AlignTradingAndBrokerSchemaDefinitions1752300000000 implements MigrationInterface {
  name = 'AlignTradingAndBrokerSchemaDefinitions1752300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Widen trading.trades.lot_size from numeric(8,4) to numeric(10,4)
    //    Entity declares numeric(10,4). DB was numeric(8,4) (max 9999.9999).
    //    Widening to numeric(10,4) (max 999999.9999) is non-destructive.
    await queryRunner.query(
      `ALTER TABLE trading.trades ALTER COLUMN lot_size TYPE numeric(10,4) USING lot_size::numeric(10,4)`,
    );

    // 2. Widen broker.broker_connections.encryption_key_id from varchar(100) to varchar(255)
    //    Entity declares varchar(255). DB was varchar(100).
    //    Widening is non-destructive — existing values fit in the wider type.
    await queryRunner.query(
      `ALTER TABLE broker.broker_connections ALTER COLUMN encryption_key_id TYPE varchar(255) USING encryption_key_id::varchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Fail-closed reversal: only narrow if ALL existing values fit the old type.

    // Check lot_size: any value > 9999.9999 would not fit numeric(8,4)
    const lotSizeOverflow = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM trading.trades
        WHERE lot_size > 9999.9999 OR lot_size < -9999.9999
      ) AS overflow`,
    );
    if (lotSizeOverflow?.[0]?.overflow === true || lotSizeOverflow?.[0]?.overflow === 't') {
      throw new Error(
        'Cannot revert lot_size to numeric(8,4): existing values exceed the old maximum (9999.9999). ' +
          'Data preservation requires keeping numeric(10,4).',
      );
    }
    await queryRunner.query(
      `ALTER TABLE trading.trades ALTER COLUMN lot_size TYPE numeric(8,4) USING lot_size::numeric(8,4)`,
    );

    // Check encryption_key_id: any value > 100 chars would not fit varchar(100)
    const keyIdOverflow = await queryRunner.query(
      `SELECT EXISTS (
        SELECT 1 FROM broker.broker_connections
        WHERE encryption_key_id IS NOT NULL AND length(encryption_key_id) > 100
      ) AS overflow`,
    );
    if (keyIdOverflow?.[0]?.overflow === true || keyIdOverflow?.[0]?.overflow === 't') {
      throw new Error(
        'Cannot revert encryption_key_id to varchar(100): existing values exceed 100 characters. ' +
          'Data preservation requires keeping varchar(255).',
      );
    }
    await queryRunner.query(
      `ALTER TABLE broker.broker_connections ALTER COLUMN encryption_key_id TYPE varchar(100) USING encryption_key_id::varchar(100)`,
    );
  }
}
