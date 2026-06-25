import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PlanPricing } from './plan-pricing.entity';
import { UserSubscription } from './user-subscription.entity';

export enum BillingInterval {
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  ANNUAL = 'ANNUAL',
}

@Entity({ name: 'subscription_plans', schema: 'subscriptions' })
export class SubscriptionPlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'billing_interval',
    type: 'enum',
    enum: BillingInterval,
    default: BillingInterval.MONTHLY,
  })
  billingInterval: BillingInterval;

  @Column({ name: 'trial_days', type: 'integer', default: 0 })
  trialDays: number;

  @Column({ name: 'performance_fee_rate', type: 'numeric', precision: 5, scale: 4, default: 0.2 })
  performanceFeeRate: string;

  @Column({ name: 'max_concurrent_trades', type: 'integer', default: 5 })
  maxConcurrentTrades: number;

  @Column({ name: 'allows_ai_auto_trading', type: 'boolean', default: false })
  allowsAiAutoTrading: boolean;

  @Column({ name: 'features', type: 'jsonb', nullable: true })
  features: Record<string, unknown> | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => PlanPricing, (pricing) => pricing.plan, { cascade: true })
  pricing: PlanPricing[];

  @OneToMany(() => UserSubscription, (sub) => sub.plan)
  subscriptions: UserSubscription[];
}
