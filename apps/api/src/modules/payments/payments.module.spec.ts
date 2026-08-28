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
import { AuditLog } from '../audit/entities/audit-log.entity';

/**
 * PaymentsModule resolution smoke test (post subscription-retirement).
 *
 * Subscription-retirement (SUBSCRIPTION-RETIREMENT-IMPL):
 *   The bidirectional dependency between PaymentsModule and SubscriptionsModule
 *   has been removed — PaymentsModule no longer imports SubscriptionsModule
 *   and WebhookProcessorService no longer injects SubscriptionsService. This
 *   test boots the REAL PaymentsModule graph (no service-level mocking of the
 *   module wiring itself) to prove Nest's DI container can resolve every
 *   provider — only the TypeORM repository tokens are stubbed out to avoid
 *   requiring a live database.
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
  it('compiles the real module graph and resolves all internal providers', async () => {
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
      .overrideProvider(getRepositoryToken(AuditLog))
      .useValue(mockRepo())
      .compile();

    // PaymentsModule's own providers resolve.
    expect(moduleRef.get(PaymentProviderRegistry)).toBeDefined();
    expect(moduleRef.get(PaymentRoutingService)).toBeDefined();
    expect(moduleRef.get(PerformanceFeePaymentService)).toBeDefined();

    // WebhookProcessorService resolves without a SubscriptionsService
    // dependency (subscription-retirement — the former forwardRef cycle is
    // gone).
    const webhookProcessor = moduleRef.get(WebhookProcessorService);
    expect(webhookProcessor).toBeDefined();
    expect(webhookProcessor).toBeInstanceOf(WebhookProcessorService);

    await moduleRef.close();
  });
});
