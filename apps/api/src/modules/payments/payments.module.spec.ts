import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PaymentsModule } from './payments.module';
import { WebhookProcessorService } from './services/webhook-processor.service';
import { PaymentRoutingService } from './services/payment-routing.service';
import { PerformanceFeePaymentService } from './services/performance-fee-payment.service';
import { PaymentProviderRegistry } from './registry/payment-provider.registry';
import { PaymentTransaction } from './entities/payment-transaction.entity';
import { Invoice } from './entities/invoice.entity';
import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity';
import { CountryConfig } from '../global-config/entities/country-config.entity';
import { PerformanceFeeAssessment } from '../performance-fees/entities/performance-fee-assessment.entity';
import { PerformanceFeeLedgerEntry } from '../performance-fees/entities/performance-fee-ledger-entry.entity';
import { TradingAccountPerformance } from '../performance-fees/entities/trading-account-performance.entity';
import { User } from '../users/entities/user.entity';
import { SubscriptionPlan } from '../subscriptions/entities/subscription-plan.entity';
import { PlanPricing } from '../subscriptions/entities/plan-pricing.entity';
import { UserSubscription } from '../subscriptions/entities/user-subscription.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';

/**
 * PaymentsModule <-> SubscriptionsModule circular-module-dependency test.
 *
 * WebhookProcessorService (in PaymentsModule) injects SubscriptionsService (in
 * SubscriptionsModule), and SubscriptionsService injects PaymentRoutingService
 * (in PaymentsModule). This is a genuine bidirectional MODULE dependency, resolved
 * via forwardRef() on both @Module({ imports: [...] }) declarations and on the
 * WebhookProcessorService constructor parameter.
 *
 * This test boots the REAL module graph (no service-level mocking of the module
 * wiring itself) to prove Nest's DI container can actually resolve it — only the
 * TypeORM repository tokens are stubbed out to avoid requiring a live database.
 */
function mockRepo() {
  return {
    find: jest.fn(async () => []),
    findOne: jest.fn(async () => null),
    create: jest.fn((x: unknown) => x),
    save: jest.fn(async (x: unknown) => x),
    update: jest.fn(async () => undefined),
    delete: jest.fn(async () => undefined),
  };
}

describe('PaymentsModule (module-graph resolution)', () => {
  it('compiles the real module graph and resolves cross-module providers', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PaymentsModule],
    })
      .overrideProvider(getRepositoryToken(PaymentTransaction))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(Invoice))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(PaymentWebhookEvent))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(CountryConfig))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(PerformanceFeeAssessment))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(PerformanceFeeLedgerEntry))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(TradingAccountPerformance))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(SubscriptionPlan))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(PlanPricing))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(UserSubscription))
      .useValue(mockRepo())
      .overrideProvider(getRepositoryToken(AuditLog))
      .useValue(mockRepo())
      .compile();

    // PaymentsModule's own providers resolve.
    expect(moduleRef.get(PaymentProviderRegistry)).toBeDefined();
    expect(moduleRef.get(PaymentRoutingService)).toBeDefined();
    expect(moduleRef.get(PerformanceFeePaymentService)).toBeDefined();

    // WebhookProcessorService resolves — proving its SubscriptionsService
    // dependency (from the forward-referenced SubscriptionsModule) was satisfied.
    const webhookProcessor = moduleRef.get(WebhookProcessorService);
    expect(webhookProcessor).toBeDefined();
    expect(webhookProcessor).toBeInstanceOf(WebhookProcessorService);

    // SubscriptionsService itself is reachable through the resolved graph,
    // confirming the bidirectional module import actually resolved both ways.
    const subscriptionsService = moduleRef.get(SubscriptionsService);
    expect(subscriptionsService).toBeDefined();
    expect(subscriptionsService).toBeInstanceOf(SubscriptionsService);

    await moduleRef.close();
  });
});
