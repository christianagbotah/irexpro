import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SubscriptionPlan } from './subscription-plan.entity';

@Entity({ name: 'plan_pricing', schema: 'subscriptions' })
export class PlanPricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'subscription_plan_id', type: 'uuid' })
  subscriptionPlanId: string;

  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode: string | null;

  @Column({ name: 'currency', type: 'varchar', length: 3 })
  currency: string;

  /** Amount in smallest currency unit (e.g. cents, pesewas). Use integer math — never float. */
  @Column({ name: 'amount_cents', type: 'bigint' })
  amountCents: string;

  @Column({ name: 'provider_plan_id', type: 'varchar', length: 255, nullable: true })
  providerPlanId: string | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => SubscriptionPlan, (plan) => plan.pricing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subscription_plan_id' })
  plan: SubscriptionPlan;
}
