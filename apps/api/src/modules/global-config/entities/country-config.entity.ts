import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'country_configs', schema: 'platform' })
export class CountryConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2, unique: true })
  @Index()
  countryCode: string;

  @Column({ name: 'country_name', type: 'varchar', length: 100 })
  countryName: string;

  @Column({ name: 'region', type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ name: 'default_currency', type: 'varchar', length: 3 })
  defaultCurrency: string;

  @Column({ name: 'supported_currencies', type: 'jsonb', default: '[]' })
  supportedCurrencies: string[];

  @Column({ name: 'enabled_payment_providers', type: 'jsonb', default: '[]' })
  enabledPaymentProviders: string[];

  @Column({ name: 'enabled_sms_providers', type: 'jsonb', default: '[]' })
  enabledSmsProviders: string[];

  @Column({ name: 'enabled_brokers', type: 'jsonb', default: '[]' })
  enabledBrokers: string[];

  @Column({ name: 'kyc_requirements', type: 'jsonb', nullable: true })
  kycRequirements: Record<string, unknown> | null;

  @Column({ name: 'subscription_plan_overrides', type: 'jsonb', nullable: true })
  subscriptionPlanOverrides: Record<string, unknown> | null;

  @Column({ name: 'tax_rules_placeholder', type: 'jsonb', nullable: true })
  taxRulesPlaceholder: Record<string, unknown> | null;

  @Column({ name: 'timezone', type: 'varchar', length: 50, default: 'UTC' })
  timezone: string;

  @Column({ name: 'locale', type: 'varchar', length: 10, default: 'en' })
  locale: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_blocked', type: 'boolean', default: false })
  isBlocked: boolean;

  @Column({ name: 'forex_trading_allowed', type: 'boolean', default: true })
  forexTradingAllowed: boolean;

  @Column({ name: 'special_disclosure_required', type: 'boolean', default: false })
  specialDisclosureRequired: boolean;

  @Column({ name: 'special_disclosure_text', type: 'text', nullable: true })
  specialDisclosureText: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
