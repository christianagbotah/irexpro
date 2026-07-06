import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanPricing } from './entities/plan-pricing.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
import { SubscriptionsController } from './subscriptions.controller';
import { SubscriptionsService } from './subscriptions.service';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubscriptionPlan, PlanPricing, UserSubscription, Invoice, PaymentTransaction]),
    AuditModule,
    // Bidirectional dependency with PaymentsModule — resolved via forwardRef.
    forwardRef(() => PaymentsModule),
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
