import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PerformanceFeePaymentService } from './performance-fee-payment.service';
import { InvoiceStatus } from '../entities/invoice.entity';
import { PaymentPurpose, PaymentTransactionStatus } from '../entities/payment-transaction.entity';
import { AssessmentStatus } from '../../performance-fees/entities/performance-fee-assessment.entity';

const OWNER = 'user-1';
const ADMIN = 'admin-1';

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1',
    userId: OWNER,
    invoiceNumber: 'PF-123',
    status: InvoiceStatus.ISSUED,
    currency: 'USD',
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
    currency: 'USD',
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
    currency: 'USD',
    amountMinor: '100000',
    providerPayloadSummary: { type: 'PERFORMANCE_FEE' },
    ...overrides,
  };
}

function makeOwner(overrides: Record<string, unknown> = {}) {
  return { id: OWNER, email: 'owner@example.com', countryCode: 'US', ...overrides };
}

let invoiceRepo: any;
let transactionRepo: any;
let assessmentRepo: any;
let userRepo: any;
let routingService: any;
let auditService: any;
let mockProvider: any;
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
    update: jest.fn(async () => undefined),
  };
  assessmentRepo = {
    findOne: jest.fn(async () => makeAssessment()),
  };
  userRepo = {
    findOne: jest.fn(async () => makeOwner()),
  };
  mockProvider = {
    providerId: 'stripe',
    createCheckoutSession: jest.fn(async () => ({
      sessionId: 'sess_123',
      checkoutUrl: 'https://pay.stripe.test/sess_123',
      providerTransactionReference: 'pi_123',
      provider: 'stripe',
    })),
  };
  routingService = {
    routeForCheckout: jest.fn(async () => ({ provider: mockProvider, reason: 'country_config' })),
  };
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

describe('initiatePerformanceFeeCheckout', () => {
  const base = { invoiceId: 'invoice-1', requestingUserId: OWNER, isAdmin: false };

  it('user can initiate checkout for own invoice; assigns routed provider and returns checkout url', async () => {
    const result = await service.initiatePerformanceFeeCheckout(base);

    expect(routingService.routeForCheckout).toHaveBeenCalledWith('US', 'USD', undefined);
    expect(mockProvider.createCheckoutSession).toHaveBeenCalledTimes(1);
    expect(transactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({
        provider: 'stripe',
        providerTransactionReference: 'pi_123',
        status: PaymentTransactionStatus.PROCESSING,
      }),
    );
    expect(result.checkoutUrl).toBe('https://pay.stripe.test/sess_123');
    expect(result.provider).toBe('stripe');
    expect(result.reusedExistingSession).toBe(false);
    // Never mark paid
    expect(invoiceRepo.update).not.toHaveBeenCalled();
  });

  it('never marks invoice or assessment PAID and never touches HWM (no perf repo dependency)', async () => {
    await service.initiatePerformanceFeeCheckout(base);
    // Invoice not updated to PAID
    expect(invoiceRepo.update).not.toHaveBeenCalled();
    // Assessment repo is read-only in this service (no update method wired)
    expect((assessmentRepo as { update?: unknown }).update).toBeUndefined();
  });

  it('normal user cannot initiate checkout for another user invoice (403)', async () => {
    invoiceRepo.findOne.mockResolvedValueOnce(makeInvoice({ userId: 'other-user' }));
    await expect(
      service.initiatePerformanceFeeCheckout({ ...base, requestingUserId: OWNER }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('admin can initiate checkout for any user invoice', async () => {
    invoiceRepo.findOne.mockResolvedValueOnce(makeInvoice({ userId: 'other-user' }));
    userRepo.findOne.mockResolvedValueOnce(makeOwner({ id: 'other-user' }));
    const result = await service.initiatePerformanceFeeCheckout({
      invoiceId: 'invoice-1',
      requestingUserId: ADMIN,
      isAdmin: true,
    });
    expect(result.provider).toBe('stripe');
  });

  it('rejects a paid invoice', async () => {
    invoiceRepo.findOne.mockResolvedValueOnce(makeInvoice({ status: InvoiceStatus.PAID }));
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects a void/cancelled invoice', async () => {
    invoiceRepo.findOne.mockResolvedValueOnce(makeInvoice({ status: InvoiceStatus.VOID }));
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects a non-performance-fee invoice', async () => {
    invoiceRepo.findOne.mockResolvedValueOnce(makeInvoice({ metadata: { type: 'SUBSCRIPTION' } }));
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when assessment is missing', async () => {
    assessmentRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects when assessment is not INVOICED', async () => {
    assessmentRepo.findOne.mockResolvedValueOnce(makeAssessment({ status: AssessmentStatus.PAID }));
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('reuses an in-progress non-manual provider session without duplicating the transaction', async () => {
    transactionRepo.findOne.mockResolvedValueOnce(
      makeTransaction({
        provider: 'stripe',
        status: PaymentTransactionStatus.PROCESSING,
        providerTransactionReference: 'pi_existing',
        providerPayloadSummary: {
          type: 'PERFORMANCE_FEE',
          sessionId: 'sess_existing',
          checkoutUrl: 'https://pay.stripe.test/sess_existing',
        },
      }),
    );

    const result = await service.initiatePerformanceFeeCheckout(base);

    expect(result.reusedExistingSession).toBe(true);
    expect(result.providerReference).toBe('pi_existing');
    expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
    expect(routingService.routeForCheckout).not.toHaveBeenCalled();
  });

  it('rejects checkout when transaction already SUCCEEDED', async () => {
    transactionRepo.findOne.mockResolvedValueOnce(
      makeTransaction({ status: PaymentTransactionStatus.SUCCEEDED }),
    );
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('provider failure keeps invoice unpaid, records failure, does not mark paid', async () => {
    mockProvider.createCheckoutSession.mockRejectedValueOnce(new Error('gateway down'));
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(invoiceRepo.update).not.toHaveBeenCalled();
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PERFORMANCE_FEE_CHECKOUT_FAILED' }),
    );
  });

  it('propagates routing failure (unsupported provider/country)', async () => {
    routingService.routeForCheckout.mockRejectedValueOnce(new BadRequestException('no provider'));
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
  });

  it('rejects when currency does not match the invoice', async () => {
    await expect(
      service.initiatePerformanceFeeCheckout({ ...base, options: { currency: 'EUR' } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when no country code can be resolved', async () => {
    userRepo.findOne.mockResolvedValueOnce(makeOwner({ countryCode: null }));
    await expect(service.initiatePerformanceFeeCheckout(base)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('audit metadata contains no secrets', async () => {
    await service.initiatePerformanceFeeCheckout(base);
    const initiated = auditService.log.mock.calls
      .map((c: any[]) => c[0])
      .find((e: any) => e.action === 'PERFORMANCE_FEE_CHECKOUT_INITIATED');
    const serialized = JSON.stringify(initiated);
    expect(serialized).not.toMatch(/secret|token|password|apiKey|authorization|pin/i);
  });
});

describe('getPerformanceFeePaymentStatus', () => {
  it('returns a safe view and audits the view', async () => {
    const view = await service.getPerformanceFeePaymentStatus('invoice-1', OWNER, false);
    expect(view.invoiceId).toBe('invoice-1');
    expect(view.paymentStatus).toBe(PaymentTransactionStatus.PENDING);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PERFORMANCE_FEE_PAYMENT_STATUS_VIEWED' }),
    );
    const serialized = JSON.stringify(view);
    expect(serialized).not.toMatch(/secret|token|password|authorization|pin/i);
  });

  it('normal user cannot view another user invoice (403)', async () => {
    invoiceRepo.findOne.mockResolvedValueOnce(makeInvoice({ userId: 'other-user' }));
    await expect(
      service.getPerformanceFeePaymentStatus('invoice-1', OWNER, false),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('throws NotFound for a missing invoice', async () => {
    invoiceRepo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.getPerformanceFeePaymentStatus('missing', OWNER, false),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('listUserPerformanceFeeInvoices', () => {
  it('returns only performance-fee invoices', async () => {
    invoiceRepo.find.mockResolvedValueOnce([
      makeInvoice({ id: 'inv-pf' }),
      makeInvoice({ id: 'inv-sub', metadata: { type: 'SUBSCRIPTION' } }),
    ]);
    const list = await service.listUserPerformanceFeeInvoices(OWNER, {});
    expect(list).toHaveLength(1);
    expect(list[0].invoiceId).toBe('inv-pf');
  });
});
