import { BadRequestException } from '@nestjs/common';
import { PerformanceFeePaymentService } from './performance-fee-payment.service';
import { InvoiceStatus } from '../entities/invoice.entity';
import { PaymentPurpose, PaymentTransactionStatus } from '../entities/payment-transaction.entity';
import { AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';
import { PaystackPaymentProvider } from '../providers/paystack.provider';
import { PaystackHttpClient } from '../providers/paystack-http.client';

const OWNER = 'user-1';

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    userId: OWNER,
    invoiceNumber: 'PF-123',
    status: InvoiceStatus.ISSUED,
    currency: 'GHS',
    totalAmount: '100000',
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
    currency: 'GHS',
    feeAmount: '100000',
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
    currency: 'GHS',
    amountMinor: '100000',
    providerPayloadSummary: { type: 'PERFORMANCE_FEE' },
    ...overrides,
  };
}

function makeOwner(overrides: Record<string, unknown> = {}) {
  return { id: OWNER, email: 'owner@example.com', countryCode: 'GH', ...overrides };
}

function enabledConfigService(): any {
  const values: Record<string, unknown> = {
    'paystack.enabled': true,
    'paystack.secretKey': 'sk_test_perf_fee_checkout',
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

describe('PerformanceFeePaymentService — Paystack checkout integration', () => {
  const base = { invoiceId: 'invoice-1', requestingUserId: OWNER, isAdmin: false };

  it('assigns Paystack to the pending performance-fee transaction and returns a checkout URL', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { status: true, data: { authorization_url: 'https://checkout.paystack.com/pf1', reference: 'psk_pf_1' } },
    });
    const provider = new PaystackPaymentProvider(enabledConfigService(), http as unknown as PaystackHttpClient);
    routingService = { routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })) };
    service = new PerformanceFeePaymentService(invoiceRepo, transactionRepo, assessmentRepo, userRepo, routingService, auditService);

    const result = await service.initiatePerformanceFeeCheckout(base);

    expect(result.provider).toBe('paystack');
    expect(result.checkoutUrl).toBe('https://checkout.paystack.com/pf1');
    expect(transactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ provider: 'paystack', status: PaymentTransactionStatus.PROCESSING }),
    );
    // Checkout must never mark paid.
    expect(invoiceRepo.update).not.toHaveBeenCalled();
  });

  it('does not mark the invoice paid on a successful checkout initiation', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { status: true, data: { authorization_url: 'https://x', reference: 'psk_pf_2' } },
    });
    const provider = new PaystackPaymentProvider(enabledConfigService(), http as unknown as PaystackHttpClient);
    routingService = { routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })) };
    service = new PerformanceFeePaymentService(invoiceRepo, transactionRepo, assessmentRepo, userRepo, routingService, auditService);

    await service.initiatePerformanceFeeCheckout(base);
    expect(invoiceRepo.update).not.toHaveBeenCalled();
  });

  it('does not mark the assessment paid on a successful checkout initiation', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { status: true, data: { authorization_url: 'https://x', reference: 'psk_pf_3' } },
    });
    const provider = new PaystackPaymentProvider(enabledConfigService(), http as unknown as PaystackHttpClient);
    routingService = { routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })) };
    service = new PerformanceFeePaymentService(invoiceRepo, transactionRepo, assessmentRepo, userRepo, routingService, auditService);

    await service.initiatePerformanceFeeCheckout(base);
    // The service has no assessment-write path at all — asserting no unexpected calls happened.
    expect(assessmentRepo.findOne).toHaveBeenCalled();
    expect((assessmentRepo as Record<string, unknown>)['update']).toBeUndefined();
  });

  it('does not update the high-water mark on a successful checkout initiation (no perf repo dependency)', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { status: true, data: { authorization_url: 'https://x', reference: 'psk_pf_4' } },
    });
    const provider = new PaystackPaymentProvider(enabledConfigService(), http as unknown as PaystackHttpClient);
    routingService = { routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })) };
    service = new PerformanceFeePaymentService(invoiceRepo, transactionRepo, assessmentRepo, userRepo, routingService, auditService);

    await service.initiatePerformanceFeeCheckout(base);
    // PerformanceFeePaymentService is constructed without a TradingAccountPerformance
    // repository at all — it is structurally incapable of touching the HWM.
    expect(service).not.toHaveProperty('performanceRepo');
  });

  it('Paystack provider failure (disabled) leaves invoice ISSUED and assessment INVOICED', async () => {
    const provider = new PaystackPaymentProvider(disabledConfigService(), new PaystackHttpClient());
    routingService = { routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })) };
    service = new PerformanceFeePaymentService(invoiceRepo, transactionRepo, assessmentRepo, userRepo, routingService, auditService);

    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toThrow(BadRequestException);

    expect(invoiceRepo.update).not.toHaveBeenCalled();
    // Transaction is released back to PENDING for retry, never marked paid.
    expect(transactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ provider: 'paystack', status: PaymentTransactionStatus.PENDING }),
    );
  });

  it('never leaks the Paystack secret key in the checkout result or audit metadata', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { status: true, data: { authorization_url: 'https://x', reference: 'psk_pf_5' } },
    });
    const provider = new PaystackPaymentProvider(enabledConfigService(), http as unknown as PaystackHttpClient);
    routingService = { routeForCheckout: jest.fn(async () => ({ provider, reason: 'country_config' })) };
    service = new PerformanceFeePaymentService(invoiceRepo, transactionRepo, assessmentRepo, userRepo, routingService, auditService);

    const result = await service.initiatePerformanceFeeCheckout(base);
    expect(JSON.stringify(result)).not.toContain('sk_test_perf_fee_checkout');
    expect(JSON.stringify(auditService.log.mock.calls)).not.toContain('sk_test_perf_fee_checkout');
  });
});
