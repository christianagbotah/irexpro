import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanPricing } from './entities/plan-pricing.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import {
  PaymentTransaction,
  PaymentTransactionStatus,
} from '../payments/entities/payment-transaction.entity';
import { AuditService } from '../audit/audit.service';
import { PaymentRoutingService } from '../payments/services/payment-routing.service';
import { PaystackPaymentProvider } from '../payments/providers/paystack.provider';
import { PaystackHttpClient } from '../payments/providers/paystack-http.client';

const mockPlanRepo = { findOne: jest.fn(), find: jest.fn() };
const mockPricingRepo = {
  createQueryBuilder: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
};
const mockSubscriptionRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };

const mockInvoiceQueryBuilder = {
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
};
const mockInvoiceRepo = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  createQueryBuilder: jest.fn(),
};
const mockTransactionRepo = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
  findOne: jest.fn(),
};
const mockAuditService = { log: jest.fn() };
const mockRoutingService = { routeForCheckout: jest.fn() };

function enabledPaystackConfigService(): any {
  const values: Record<string, unknown> = {
    'paystack.enabled': true,
    'paystack.secretKey': 'sk_test_subscription_checkout',
  };
  return { get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
}

function disabledPaystackConfigService(): any {
  return { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? undefined) };
}

describe('SubscriptionsService — Paystack checkout integration', () => {
  let module: TestingModule;
  let service: SubscriptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPricingRepo.createQueryBuilder.mockReturnValue(mockPricingRepo);
    mockInvoiceRepo.createQueryBuilder.mockReturnValue(mockInvoiceQueryBuilder);

    mockSubscriptionRepo.findOne.mockResolvedValue(null);
    mockInvoiceQueryBuilder.getOne.mockResolvedValue(null);
    mockTransactionRepo.findOne.mockResolvedValue(null);
    mockTransactionRepo.update.mockResolvedValue({ affected: 1 });

    module = await Test.createTestingModule({
      providers: [
        SubscriptionsService,
        { provide: getRepositoryToken(SubscriptionPlan), useValue: mockPlanRepo },
        { provide: getRepositoryToken(PlanPricing), useValue: mockPricingRepo },
        { provide: getRepositoryToken(UserSubscription), useValue: mockSubscriptionRepo },
        { provide: getRepositoryToken(Invoice), useValue: mockInvoiceRepo },
        { provide: getRepositoryToken(PaymentTransaction), useValue: mockTransactionRepo },
        { provide: AuditService, useValue: mockAuditService },
        { provide: PaymentRoutingService, useValue: mockRoutingService },
      ],
    }).compile();

    service = module.get<SubscriptionsService>(SubscriptionsService);

    mockPlanRepo.findOne.mockResolvedValue({ id: 'plan-1', name: 'Pro', isActive: true });
    mockPricingRepo.getOne.mockResolvedValue({ amountCents: '5000', countryCode: 'GH' });
    mockInvoiceRepo.create.mockImplementation((x: unknown) => x);
    mockInvoiceRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'invoice-1' }));
    mockTransactionRepo.create.mockImplementation((x: unknown) => x);
    mockTransactionRepo.save.mockImplementation(async (x: any) => ({ ...x, id: 'tx-1' }));
  });

  afterEach(async () => {
    await module.close();
  });

  const request = {
    userId: 'user-1',
    email: 'user@example.com',
    planId: 'plan-1',
    currency: 'GHS',
    countryCode: 'GH',
    provider: 'paystack',
  };

  it('Paystack checkout creates a provider reference but leaves the subscription untouched', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/xyz', reference: 'psk_new_sub' },
      },
    });
    const provider = new PaystackPaymentProvider(
      enabledPaystackConfigService(),
      http as unknown as PaystackHttpClient,
    );
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    const result = await service.initiateCheckout(request);

    expect(result.provider).toBe('paystack');
    expect(result.checkoutUrl).toBe('https://checkout.paystack.com/xyz');
    // Subscription activation must never be touched by checkout — only a verified webhook activates it.
    expect(mockSubscriptionRepo.save).not.toHaveBeenCalled();
    expect(mockSubscriptionRepo.create).not.toHaveBeenCalled();
  });

  it('Paystack provider failure (disabled/unconfigured) does not activate a subscription', async () => {
    const provider = new PaystackPaymentProvider(
      disabledPaystackConfigService(),
      new PaystackHttpClient(),
    );
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    await expect(service.initiateCheckout(request)).rejects.toThrow(BadRequestException);

    // Reverted to PENDING (not FAILED) so the transaction is recoverable for retry.
    expect(mockTransactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: PaymentTransactionStatus.PENDING }),
    );
    expect(mockSubscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('Paystack checkout failure (status=false from Paystack) leaves invoice/transaction unpaid', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: false,
      status: 200,
      body: { status: false },
      errorMessage: 'Invalid currency',
    });
    const provider = new PaystackPaymentProvider(
      enabledPaystackConfigService(),
      http as unknown as PaystackHttpClient,
    );
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    await expect(service.initiateCheckout(request)).rejects.toThrow(BadRequestException);
    expect(mockTransactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: PaymentTransactionStatus.PENDING }),
    );
  });

  it('never sends the Paystack secret key in the checkout result', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/safe', reference: 'psk_safe' },
      },
    });
    const provider = new PaystackPaymentProvider(
      enabledPaystackConfigService(),
      http as unknown as PaystackHttpClient,
    );
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    const result = await service.initiateCheckout(request);
    expect(JSON.stringify(result)).not.toContain('sk_test_subscription_checkout');
  });

  it('a second identical Paystack checkout reuses the same pending invoice/transaction', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: {
        status: true,
        data: { authorization_url: 'https://checkout.paystack.com/first', reference: 'psk_first' },
      },
    });
    const provider = new PaystackPaymentProvider(
      enabledPaystackConfigService(),
      http as unknown as PaystackHttpClient,
    );
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    const first = await service.initiateCheckout(request);
    expect(first.reused).toBe(false);

    // Simulate the pending invoice/transaction created by the first call being found on retry.
    mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
      id: 'invoice-1',
      status: 'DRAFT',
      currency: 'GHS',
      totalAmount: '5000',
      metadata: {
        type: 'SUBSCRIPTION',
        planId: 'plan-1',
        countryCode: 'GH',
        paymentPurpose: 'SUBSCRIPTION_INITIAL',
      },
    });
    mockTransactionRepo.findOne.mockResolvedValueOnce({
      id: 'tx-1',
      invoiceId: 'invoice-1',
      status: PaymentTransactionStatus.PROCESSING,
      provider: 'paystack',
      providerTransactionReference: 'psk_first',
      providerPayloadSummary: {
        checkoutUrl: 'https://checkout.paystack.com/first',
        sessionId: 'psk_first',
      },
    });

    const second = await service.initiateCheckout(request);
    expect(second.reused).toBe(true);
    expect(second.invoiceId).toBe('invoice-1');
    expect(second.transactionId).toBe('tx-1');
    expect(second.checkoutUrl).toBe('https://checkout.paystack.com/first');
    // Only ONE Paystack HTTP call — the second request must reuse the first session.
    expect(http.request).toHaveBeenCalledTimes(1);
  });
});
