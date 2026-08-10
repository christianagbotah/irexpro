import { BadRequestException } from '@nestjs/common';
import { PerformanceFeePaymentService } from './performance-fee-payment.service';
import { InvoiceStatus } from '../entities/invoice.entity';
import { PaymentPurpose, PaymentTransactionStatus } from '../entities/payment-transaction.entity';
import { AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';
import { StripePaymentProvider } from '../providers/stripe.provider';
import { StripeHttpClient } from '../providers/stripe-http.client';

const OWNER = 'user-1';

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    userId: OWNER,
    invoiceNumber: 'PF-123',
    status: InvoiceStatus.ISSUED,
    currency: 'USD',
    totalAmount: '200000',
    dueDate: new Date('2026-07-10T00:00:00Z'),
    paidAt: null,
    metadata: { type: 'PERFORMANCE_FEE', assessmentId: 'assessment-1' },
    createdAt: new Date('2026-06-01T00:00:00Z'),
    ...overrides,
  };
}

function makeAssessment(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assessment-1',
    userId: OWNER,
    invoiceId: 'invoice-1',
    status: AssessmentStatus.INVOICED,
    currency: 'USD',
    feeAmount: '200000',
    ...overrides,
  };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tx-1',
    userId: OWNER,
    invoiceId: 'invoice-1',
    provider: 'manual',
    providerTransactionReference: null,
    paymentPurpose: PaymentPurpose.PERFORMANCE_FEE,
    status: PaymentTransactionStatus.PENDING,
    currency: 'USD',
    amountMinor: '200000',
    providerPayloadSummary: { type: 'PERFORMANCE_FEE' },
    ...overrides,
  };
}

function makeOwner(overrides: Record<string, unknown> = {}) {
  return { id: OWNER, email: 'owner@example.com', countryCode: 'US', ...overrides };
}

function enabledConfigService(): any {
  const values: Record<string, unknown> = {
    'stripe.enabled': true,
    'stripe.secretKey': 'sk_test_perf_fee_checkout',
    'stripe.successUrl': 'https://app.irexpro.com/success',
    'stripe.cancelUrl': 'https://app.irexpro.com/cancel',
  };
  return { get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
}

function disabledConfigService(): any {
  return { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? undefined) };
}

let invoiceRepo: any;
let transactionRepo: any;
let assessmentRepo: any;
let userRepo: any;
let routingService: any;
let auditService: any;
let service: PerformanceFeePaymentService;

beforeEach(() => {
  jest.clearAllMocks();

  invoiceRepo = {
    findOne: jest.fn(async () => makeInvoice()),
    find: jest.fn(async () => [makeInvoice()]),
    update: jest.fn(async () => undefined),
  };
  transactionRepo = {
    findOne: jest.fn(async () => makeTransaction()),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  assessmentRepo = { findOne: jest.fn(async () => makeAssessment()) };
  userRepo = { findOne: jest.fn(async () => makeOwner()) };
  auditService = { log: jest.fn(async () => undefined) };

  service = new PerformanceFeePaymentService(
    invoiceRepo,
    transactionRepo,
    assessmentRepo,
    userRepo,
    routingService,
    auditService,
  );
});

describe('PerformanceFeePaymentService — Stripe checkout integration (Sprint 17)', () => {
  const base = { invoiceId: 'invoice-1', requestingUserId: OWNER, isAdmin: false };

  it('assigns Stripe to the pending performance-fee transaction and returns a checkout URL', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_pf_1', url: 'https://checkout.stripe.com/pf1' },
    });
    const provider = new StripePaymentProvider(
      enabledConfigService(),
      http as unknown as StripeHttpClient,
    );
    routingService = {
      routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })),
    };
    service = new PerformanceFeePaymentService(
      invoiceRepo,
      transactionRepo,
      assessmentRepo,
      userRepo,
      routingService,
      auditService,
    );

    const result = await service.initiatePerformanceFeeCheckout(base);

    expect(result.provider).toBe('stripe');
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/pf1');
    expect(transactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ provider: 'stripe', status: PaymentTransactionStatus.PROCESSING }),
    );
    // Checkout must never mark paid.
    expect(invoiceRepo.update).not.toHaveBeenCalled();
  });

  it('reuses an already-active Stripe checkout session instead of creating a second one', async () => {
    transactionRepo.findOne = jest.fn(async () =>
      makeTransaction({
        provider: 'stripe',
        status: PaymentTransactionStatus.PROCESSING,
        providerTransactionReference: 'cs_existing',
        providerPayloadSummary: {
          checkoutUrl: 'https://checkout.stripe.com/existing',
          sessionId: 'cs_existing',
        },
      }),
    );
    const http = { request: jest.fn() };
    const provider = new StripePaymentProvider(
      enabledConfigService(),
      http as unknown as StripeHttpClient,
    );
    routingService = {
      routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })),
    };
    service = new PerformanceFeePaymentService(
      invoiceRepo,
      transactionRepo,
      assessmentRepo,
      userRepo,
      routingService,
      auditService,
    );

    const result = await service.initiatePerformanceFeeCheckout(base);

    expect(result.reusedExistingSession).toBe(true);
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/existing');
    expect(http.request).not.toHaveBeenCalled();
  });

  it('does not mark the invoice paid on a successful checkout initiation', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_pf_2', url: 'https://x' },
    });
    const provider = new StripePaymentProvider(
      enabledConfigService(),
      http as unknown as StripeHttpClient,
    );
    routingService = {
      routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })),
    };
    service = new PerformanceFeePaymentService(
      invoiceRepo,
      transactionRepo,
      assessmentRepo,
      userRepo,
      routingService,
      auditService,
    );

    await service.initiatePerformanceFeeCheckout(base);
    expect(invoiceRepo.update).not.toHaveBeenCalled();
  });

  it('does not mark the assessment paid on a successful checkout initiation', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_pf_3', url: 'https://x' },
    });
    const provider = new StripePaymentProvider(
      enabledConfigService(),
      http as unknown as StripeHttpClient,
    );
    routingService = {
      routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })),
    };
    service = new PerformanceFeePaymentService(
      invoiceRepo,
      transactionRepo,
      assessmentRepo,
      userRepo,
      routingService,
      auditService,
    );

    await service.initiatePerformanceFeeCheckout(base);
    expect(assessmentRepo.findOne).toHaveBeenCalled();
    expect((assessmentRepo as Record<string, unknown>)['update']).toBeUndefined();
  });

  it('does not update the high-water mark on a successful checkout initiation (no perf repo dependency)', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_pf_4', url: 'https://x' },
    });
    const provider = new StripePaymentProvider(
      enabledConfigService(),
      http as unknown as StripeHttpClient,
    );
    routingService = {
      routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })),
    };
    service = new PerformanceFeePaymentService(
      invoiceRepo,
      transactionRepo,
      assessmentRepo,
      userRepo,
      routingService,
      auditService,
    );

    await service.initiatePerformanceFeeCheckout(base);
    // PerformanceFeePaymentService is constructed without a TradingAccountPerformance
    // repository at all — it is structurally incapable of touching the HWM.
    expect(service).not.toHaveProperty('performanceRepo');
  });

  it('Stripe provider failure (disabled) leaves invoice ISSUED and assessment INVOICED', async () => {
    const provider = new StripePaymentProvider(disabledConfigService(), new StripeHttpClient());
    routingService = {
      routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })),
    };
    service = new PerformanceFeePaymentService(
      invoiceRepo,
      transactionRepo,
      assessmentRepo,
      userRepo,
      routingService,
      auditService,
    );

    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toThrow(BadRequestException);

    expect(invoiceRepo.update).not.toHaveBeenCalled();
    // Transaction is released back to PENDING for retry, never marked paid.
    expect(transactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ provider: 'stripe', status: PaymentTransactionStatus.PENDING }),
    );
  });

  it('never leaks the Stripe secret key in the checkout result or audit metadata', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_pf_5', url: 'https://x' },
    });
    const provider = new StripePaymentProvider(
      enabledConfigService(),
      http as unknown as StripeHttpClient,
    );
    routingService = {
      routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })),
    };
    service = new PerformanceFeePaymentService(
      invoiceRepo,
      transactionRepo,
      assessmentRepo,
      userRepo,
      routingService,
      auditService,
    );

    const result = await service.initiatePerformanceFeeCheckout(base);
    expect(JSON.stringify(result)).not.toContain('sk_test_perf_fee_checkout');
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('sk_test_perf_fee_checkout');
  });
});
