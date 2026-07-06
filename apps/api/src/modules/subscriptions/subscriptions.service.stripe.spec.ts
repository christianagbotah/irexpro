import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanPricing } from './entities/plan-pricing.entity';
import { UserSubscription } from './entities/user-subscription.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { PaymentTransaction, PaymentTransactionStatus } from '../payments/entities/payment-transaction.entity';
import { AuditService } from '../audit/audit.service';
import { PaymentRoutingService } from '../payments/services/payment-routing.service';
import { StripePaymentProvider } from '../payments/providers/stripe.provider';
import { StripeHttpClient } from '../payments/providers/stripe-http.client';

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
const mockTransactionRepo = { create: jest.fn(), save: jest.fn(), update: jest.fn(), findOne: jest.fn() };
const mockAuditService = { log: jest.fn() };
const mockRoutingService = { routeForCheckout: jest.fn() };

function enabledStripeConfigService(): any {
  const values: Record<string, unknown> = {
    'stripe.enabled': true,
    'stripe.secretKey': 'sk_test_subscription_checkout',
    'stripe.successUrl': 'https://app.irexpro.com/success',
    'stripe.cancelUrl': 'https://app.irexpro.com/cancel',
  };
  return { get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback) };
}

function disabledStripeConfigService(): any {
  return { get: jest.fn((_key: string, fallback?: unknown) => fallback ?? undefined) };
}

describe('SubscriptionsService — Stripe checkout integration (Sprint 17)', () => {
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
    mockPricingRepo.getOne.mockResolvedValue({ amountCents: '2900', countryCode: 'US' });
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
    currency: 'USD',
    countryCode: 'US',
    provider: 'stripe',
  };

  it('Stripe checkout creates a provider session but leaves the subscription untouched', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_new_sub', url: 'https://checkout.stripe.com/xyz' },
    });
    const provider = new StripePaymentProvider(enabledStripeConfigService(), http as unknown as StripeHttpClient);
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    const result = await service.initiateCheckout(request);

    expect(result.provider).toBe('stripe');
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/xyz');
    // Subscription activation must never be touched by checkout — only a verified webhook activates it.
    expect(mockSubscriptionRepo.save).not.toHaveBeenCalled();
    expect(mockSubscriptionRepo.create).not.toHaveBeenCalled();
  });

  it('Stripe provider failure (disabled/unconfigured) does not activate a subscription', async () => {
    const provider = new StripePaymentProvider(disabledStripeConfigService(), new StripeHttpClient());
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    await expect(service.initiateCheckout(request)).rejects.toThrow(BadRequestException);

    // Reverted to PENDING (not FAILED) so the transaction is recoverable for retry.
    expect(mockTransactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: PaymentTransactionStatus.PENDING }),
    );
    expect(mockSubscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('Stripe checkout session creation failure (Stripe error response) leaves invoice/transaction unpaid', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: false,
      status: 400,
      body: { error: { message: 'Invalid currency' } },
      errorMessage: 'Invalid currency',
    });
    const provider = new StripePaymentProvider(enabledStripeConfigService(), http as unknown as StripeHttpClient);
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    await expect(service.initiateCheckout(request)).rejects.toThrow(BadRequestException);
    expect(mockTransactionRepo.update).toHaveBeenCalledWith(
      'tx-1',
      expect.objectContaining({ status: PaymentTransactionStatus.PENDING }),
    );
  });

  it('never sends the Stripe secret key in the checkout result', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_safe', url: 'https://checkout.stripe.com/safe' },
    });
    const provider = new StripePaymentProvider(enabledStripeConfigService(), http as unknown as StripeHttpClient);
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    const result = await service.initiateCheckout(request);
    expect(JSON.stringify(result)).not.toContain('sk_test_subscription_checkout');
  });

  it('a second identical Stripe checkout reuses the same pending invoice/transaction and provider session', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_first', url: 'https://checkout.stripe.com/first' },
    });
    const provider = new StripePaymentProvider(enabledStripeConfigService(), http as unknown as StripeHttpClient);
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    const first = await service.initiateCheckout(request);
    expect(first.reused).toBe(false);

    // Simulate the pending invoice/transaction created by the first call being found on retry.
    mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
      id: 'invoice-1',
      status: 'DRAFT',
      currency: 'USD',
      totalAmount: '2900',
      metadata: { type: 'SUBSCRIPTION', planId: 'plan-1', countryCode: 'US', paymentPurpose: 'SUBSCRIPTION_INITIAL' },
    });
    mockTransactionRepo.findOne.mockResolvedValueOnce({
      id: 'tx-1',
      invoiceId: 'invoice-1',
      status: PaymentTransactionStatus.PROCESSING,
      provider: 'stripe',
      providerTransactionReference: 'cs_first',
      providerPayloadSummary: { checkoutUrl: 'https://checkout.stripe.com/first', sessionId: 'cs_first' },
    });

    const second = await service.initiateCheckout(request);
    expect(second.reused).toBe(true);
    expect(second.invoiceId).toBe('invoice-1');
    expect(second.transactionId).toBe('tx-1');
    expect(second.checkoutUrl).toBe('https://checkout.stripe.com/first');
    // Only ONE Stripe HTTP call — the second request must reuse the first session, never
    // create a second Checkout Session for the same pending identity.
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  it('subscription checkout idempotency (Sprint 16) still works with Stripe as the routed provider', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_idem', url: 'https://checkout.stripe.com/idem' },
    });
    const provider = new StripePaymentProvider(enabledStripeConfigService(), http as unknown as StripeHttpClient);
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    const requestWithKey = { ...request, idempotencyKey: 'idem-key-stripe-1' };
    const first = await service.initiateCheckout(requestWithKey);
    expect(first.reason).toBe('NEW_CHECKOUT');

    // Idempotency replay looks up by idempotencyKeyHash via a single invoiceRepo query —
    // reuse the actual metadata (hash + fingerprint) that createInvoiceAndTransaction stored
    // on the first call so the replay's fingerprint check passes.
    const savedInvoiceArg = mockInvoiceRepo.save.mock.calls[0][0];
    mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
      id: 'invoice-1',
      status: 'DRAFT',
      currency: 'USD',
      totalAmount: '2900',
      metadata: savedInvoiceArg.metadata,
    });
    mockTransactionRepo.findOne.mockResolvedValueOnce({
      id: 'tx-1',
      invoiceId: 'invoice-1',
      status: PaymentTransactionStatus.PROCESSING,
      provider: 'stripe',
      providerTransactionReference: 'cs_idem',
      providerPayloadSummary: { checkoutUrl: 'https://checkout.stripe.com/idem', sessionId: 'cs_idem' },
    });

    const second = await service.initiateCheckout(requestWithKey);
    expect(second.reason).toBe('IDEMPOTENCY_KEY_REPLAY');
    expect(second.checkoutUrl).toBe('https://checkout.stripe.com/idem');
    expect(http.request).toHaveBeenCalledTimes(1);
  });

  it('an amount mismatch (stale pending invoice) never reuses the old Stripe session — creates a fresh checkout', async () => {
    const http = { request: jest.fn() };
    http.request.mockResolvedValue({
      ok: true,
      status: 200,
      body: { id: 'cs_repriced', url: 'https://checkout.stripe.com/repriced' },
    });
    const provider = new StripePaymentProvider(enabledStripeConfigService(), http as unknown as StripeHttpClient);
    mockRoutingService.routeForCheckout.mockResolvedValue({ provider, reason: 'preferred' });

    // Pending invoice exists with a STALE amount (price changed since it was created).
    mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
      id: 'invoice-stale',
      status: 'DRAFT',
      currency: 'USD',
      totalAmount: '1900', // stale — current price is 2900
      metadata: { type: 'SUBSCRIPTION', planId: 'plan-1', countryCode: 'US', paymentPurpose: 'SUBSCRIPTION_INITIAL' },
    });
    mockTransactionRepo.findOne.mockResolvedValueOnce({
      id: 'tx-stale',
      invoiceId: 'invoice-stale',
      status: PaymentTransactionStatus.PROCESSING,
      provider: 'stripe',
      providerTransactionReference: 'cs_stale',
      providerPayloadSummary: { checkoutUrl: 'https://checkout.stripe.com/stale', sessionId: 'cs_stale' },
    });

    const result = await service.initiateCheckout(request);
    expect(result.checkoutUrl).toBe('https://checkout.stripe.com/repriced');
    expect(http.request).toHaveBeenCalledTimes(1);
  });
});
