import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Sprint 29 — Trader onboarding fields.
 *
 * Adds:
 * 1. identity.user_profiles.trading_experience_level — self-reported experience
 *    (BEGINNER / INTERMEDIATE / ADVANCED / PROFESSIONAL). Used for onboarding
 *    profile completion + personalized risk defaults.
 * 2. trading.risk_profiles.risk_acknowledgement_accepted + _accepted_at —
 *    explicit user acceptance of the risk disclosure before trading.
 *    Separate from UserProfile.riskDisclosureAccepted (which is a general
 *    KYC/onboarding flag). This is the hard gate for canStartTrading.
 * 3. trading.risk_profiles.max_trade_risk_percent — max risk per trade as
 *    % of equity (default 2.0, range 0.5–10).
 * 4. trading.risk_profiles.max_leverage_allowed — max leverage (default 30,
 *    range 1–500).
 * 5. trading.risk_profiles.allowed_trading_modes — enum PAPER_ONLY / SEMI_AUTO
 *    / FULL_AUTO (default PAPER_ONLY — safest).
 *
 * Non-destructive: all ADD COLUMN IF NOT EXISTS. Safe on existing databases.
 */
export class AddTraderOnboardingFields1752000000000 implements MigrationInterface {
  name = 'AddTraderOnboardingFields1752000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. UserProfile: trading_experience_level enum + column
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE identity.trading_experience_level AS ENUM (
          'BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'PROFESSIONAL'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE identity.user_profiles
      ADD COLUMN IF NOT EXISTS trading_experience_level identity.trading_experience_level
    `);

    // 2. RiskProfile: risk_acknowledgement_accepted + _accepted_at
    await queryRunner.query(`
      ALTER TABLE trading.risk_profiles
      ADD COLUMN IF NOT EXISTS risk_acknowledgement_accepted boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE trading.risk_profiles
      ADD COLUMN IF NOT EXISTS risk_acknowledgement_accepted_at timestamptz
    `);

    // 3. RiskProfile: max_trade_risk_percent (default 2.0 — conservative)
    await queryRunner.query(`
      ALTER TABLE trading.risk_profiles
      ADD COLUMN IF NOT EXISTS max_trade_risk_percent numeric(5,2) NOT NULL DEFAULT '2.00'
    `);

    // 4. RiskProfile: max_leverage_allowed (default 30 — conservative)
    await queryRunner.query(`
      ALTER TABLE trading.risk_profiles
      ADD COLUMN IF NOT EXISTS max_leverage_allowed integer NOT NULL DEFAULT 30
    `);

    // 5. RiskProfile: allowed_trading_modes enum + column (default PAPER_ONLY)
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE trading.allowed_trading_mode AS ENUM (
          'PAPER_ONLY', 'SEMI_AUTO', 'FULL_AUTO'
        );
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE trading.risk_profiles
      ADD COLUMN IF NOT EXISTS allowed_trading_modes trading.allowed_trading_mode NOT NULL DEFAULT 'PAPER_ONLY'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE trading.risk_profiles DROP COLUMN IF EXISTS allowed_trading_modes`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS trading.allowed_trading_mode`);
    await queryRunner.query(
      `ALTER TABLE trading.risk_profiles DROP COLUMN IF EXISTS max_leverage_allowed`,
    );
    await queryRunner.query(
      `ALTER TABLE trading.risk_profiles DROP COLUMN IF EXISTS max_trade_risk_percent`,
    );
    await queryRunner.query(
      `ALTER TABLE trading.risk_profiles DROP COLUMN IF EXISTS risk_acknowledgement_accepted_at`,
    );
    await queryRunner.query(
      `ALTER TABLE trading.risk_profiles DROP COLUMN IF EXISTS risk_acknowledgement_accepted`,
    );
    await queryRunner.query(
      `ALTER TABLE identity.user_profiles DROP COLUMN IF EXISTS trading_experience_level`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS identity.trading_experience_level`);
  }
}
