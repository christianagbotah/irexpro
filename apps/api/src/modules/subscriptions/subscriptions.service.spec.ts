import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { createHash } from 'crypto';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService, CheckoutReason } from './subscriptions.service';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanPricing } from './entities/plan-pricing.entity';
import { UserSubscription, SubscriptionStatus } from './entities/user-subscription.entity';
import { Invoice, InvoiceStatus } from '../payments/entities/invoice.entity';
import { PaymentTransaction, PaymentPurpose, PaymentTransactionStatus } from '../payments/entities/payment-transaction.entity';
import { AuditService } from '../audit/audit.service';
import { PaymentRoutingService } from '../payments/services/payment-routing.service';

const mockPlanRepo = { findOne: jest.fn(), find: jest.fn() };
const mockPricingRepo = {
  createQueryBuilder: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  andWhere: jest.fn().mockReturnThis(),
  orderBy: jest.fn().mockReturnThis(),
  getOne: jest.fn(),
};
const mockSubscriptionRepo = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

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

const mockProvider = {
  providerId: 'stripe',
  createCheckoutSession: jest.fn(),
};

describe('SubscriptionsService', () => {
  let module: TestingModule;
  let service: SubscriptionsService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-wire the query builder chains
    mockPricingRepo.createQueryBuilder.mockReturnValue(mockPricingRepo);
    mockInvoiceRepo.createQueryBuilder.mockReturnValue(mockInvoiceQueryBuilder);

    // Safe defaults for the Sprint 16 reuse/idempotency lookups — most tests never
    // hit a pre-existing subscription/invoice, so default them to "not found".
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
  });

  afterEach(async () => {
    await module.close();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── canUserStartAiAutoTrading ────────────────────────────────────────────

  describe('canUserStartAiAutoTrading', () => {
    it('should return false when user has no subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce(null);
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('should return false when plan does not allow AI trading', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: false },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('should return false when ACTIVE subscription has expired', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() - 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('should return true for valid ACTIVE subscription with AI trading allowed', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(true);
    });

    it('should return true for valid TRIAL subscription within trial period', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.TRIAL,
        plan: { allowsAiAutoTrading: true },
        trialEndsAt: new Date(Date.now() + 86400000),
        currentPeriodEnd: null,
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(true);
    });

    it('should return false for TRIAL subscription where trial has expired', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.TRIAL,
        plan: { allowsAiAutoTrading: true },
        trialEndsAt: new Date(Date.now() - 86400000),
        currentPeriodEnd: null,
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('should return false for CANCELLED subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.CANCELLED,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('should return false for EXPIRED subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.EXPIRED,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('should return false for PAST_DUE subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.PAST_DUE,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('pending payment (PENDING status) does not activate subscription', async () => {
      // A PENDING subscription would map to TRIAL or not exist — this tests that
      // subscription status only allows ACTIVE or TRIAL
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: 'PENDING', // Not a valid SubscriptionStatus for AI trading
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });
  });

  // ─── initiateCheckout ─────────────────────────────────────────────────────

  describe('initiateCheckout', () => {
    const baseRequest = {
      userId: 'user-id',
      email: 'user@test.com',
      planId: 'plan-id',
      currency: 'USD',
      countryCode: 'US',
    };

    function mockFreshCheckoutHappyPath() {
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
      mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900', subscriptionPlanId: 'plan-id' });
      mockRoutingService.routeForCheckout.mockResolvedValueOnce({
        provider: mockProvider,
        reason: 'preferred',
      });
      const savedInvoice = { id: 'inv-id', metadata: {} };
      const savedTx = { id: 'tx-id', status: PaymentTransactionStatus.PENDING, provider: 'stripe' };
      mockInvoiceRepo.create.mockReturnValue(savedInvoice);
      mockInvoiceRepo.save.mockResolvedValue(savedInvoice);
      mockTransactionRepo.create.mockReturnValue(savedTx);
      mockTransactionRepo.save.mockResolvedValue(savedTx);
    }

    it('should throw NotFoundException when plan not found', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when no pricing found', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
      mockPricingRepo.getOne.mockResolvedValueOnce(null);
      await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(BadRequestException);
    });

    it('should create pending invoice and transaction on checkout', async () => {
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockResolvedValue({
        sessionId: 'sess_123',
        checkoutUrl: 'https://stripe.com/pay/sess_123',
        provider: 'stripe',
      });

      const result = await service.initiateCheckout(baseRequest);

      expect(mockInvoiceRepo.save).toHaveBeenCalled();
      expect(mockTransactionRepo.save).toHaveBeenCalled();
      expect(result.invoiceId).toBe('inv-id');
      expect(result.transactionId).toBe('tx-id');
      expect(result.requiresRedirect).toBe(true);
      expect(result.checkoutUrl).toBe('https://stripe.com/pay/sess_123');
      expect(result.reused).toBe(false);
      expect(result.reason).toBe(CheckoutReason.NEW_CHECKOUT);
      // checkout must NOT activate the subscription — only verified webhook does
      expect(mockSubscriptionRepo.save).not.toHaveBeenCalled();
      // audit completeness
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'INVOICE_CREATED' }),
      );
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_CHECKOUT_INITIATED' }),
      );
    });

    it('should select provider via routing service', async () => {
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockResolvedValue({
        sessionId: 'sess_456',
        provider: 'stripe',
      });

      await service.initiateCheckout(baseRequest);

      expect(mockRoutingService.routeForCheckout).toHaveBeenCalledWith('US', 'USD', undefined);
    });

    it('should audit PAYMENT_CHECKOUT_FAILED when provider throws', async () => {
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockRejectedValue(new Error('Provider error'));

      await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(BadRequestException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_CHECKOUT_FAILED' }),
      );
      // Reverted to PENDING (not FAILED) so the transaction remains recoverable for retry
      // and a later checkout call does not spawn a brand-new invoice.
      expect(mockTransactionRepo.update).toHaveBeenCalledWith(
        'tx-id',
        expect.objectContaining({ status: PaymentTransactionStatus.PENDING }),
      );
    });

    // ─── Active subscription blocks duplicate checkout ──────────────────────

    it('active subscription for the same plan blocks a new checkout', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
      mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        subscriptionPlanId: 'plan-id',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });

      await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(ConflictException);
      expect(mockInvoiceRepo.save).not.toHaveBeenCalled();
      expect(mockTransactionRepo.save).not.toHaveBeenCalled();
    });

    it('expired active subscription does not block a new checkout', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        subscriptionPlanId: 'plan-id',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() - 86400000),
      });
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_1', provider: 'stripe' });

      const result = await service.initiateCheckout(baseRequest);
      expect(result.reused).toBe(false);
    });

    it('active subscription for a DIFFERENT plan does not block checkout', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        subscriptionPlanId: 'some-other-plan',
        status: SubscriptionStatus.ACTIVE,
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_1', provider: 'stripe' });

      const result = await service.initiateCheckout(baseRequest);
      expect(result.reused).toBe(false);
    });

    // ─── Pending invoice/transaction reuse ───────────────────────────────────

    describe('pending checkout reuse', () => {
      function existingPendingInvoiceAndTx(overrides: Partial<PaymentTransaction> = {}) {
        const invoice = {
          id: 'inv-existing',
          status: InvoiceStatus.DRAFT,
          currency: 'USD',
          totalAmount: '2900',
          metadata: { type: 'SUBSCRIPTION', planId: 'plan-id', countryCode: 'US', paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL },
        } as unknown as Invoice;
        const transaction = {
          id: 'tx-existing',
          invoiceId: 'inv-existing',
          status: PaymentTransactionStatus.PENDING,
          provider: 'stripe',
          providerTransactionReference: null,
          providerPayloadSummary: null,
          ...overrides,
        } as unknown as PaymentTransaction;
        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce(invoice);
        mockTransactionRepo.findOne.mockResolvedValueOnce(transaction);
        return { invoice, transaction };
      }

      it('second identical checkout reuses the existing invoice and transaction (no new rows)', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        mockRoutingService.routeForCheckout.mockResolvedValueOnce({ provider: mockProvider, reason: 'preferred' });
        existingPendingInvoiceAndTx();
        mockProvider.createCheckoutSession.mockResolvedValue({
          sessionId: 'sess_new',
          checkoutUrl: 'https://stripe.com/pay/sess_new',
          provider: 'stripe',
        });

        const result = await service.initiateCheckout(baseRequest);

        expect(mockInvoiceRepo.save).not.toHaveBeenCalled();
        expect(mockTransactionRepo.save).not.toHaveBeenCalled();
        expect(result.invoiceId).toBe('inv-existing');
        expect(result.transactionId).toBe('tx-existing');
        expect(result.reused).toBe(true);
        expect(result.reason).toBe(CheckoutReason.REUSED_PENDING_CHECKOUT);
        expect(mockAuditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'PAYMENT_CHECKOUT_REUSED' }),
        );
      });

      it('reuses an existing ACTIVE provider session without creating a new one', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        existingPendingInvoiceAndTx({
          status: PaymentTransactionStatus.PROCESSING,
          providerTransactionReference: 'psk_ref_123',
          providerPayloadSummary: { checkoutUrl: 'https://checkout.example/psk_ref_123', sessionId: 'sess_active' },
        });

        const result = await service.initiateCheckout(baseRequest);

        expect(mockRoutingService.routeForCheckout).not.toHaveBeenCalled();
        expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
        expect(result.reused).toBe(true);
        expect(result.reason).toBe(CheckoutReason.PROVIDER_SESSION_REUSED);
        expect(result.checkoutUrl).toBe('https://checkout.example/psk_ref_123');
        expect(result.providerTransactionReference).toBe('psk_ref_123');
        expect(mockAuditService.log).toHaveBeenCalledWith(
          expect.objectContaining({ action: 'PAYMENT_CHECKOUT_PROVIDER_SESSION_REUSED' }),
        );
      });

      it('manual/no-session pending transaction can be assigned to a routed provider', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        mockRoutingService.routeForCheckout.mockResolvedValueOnce({ provider: mockProvider, reason: 'preferred' });
        existingPendingInvoiceAndTx({ provider: 'manual', providerTransactionReference: null });
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_x', provider: 'stripe' });

        const result = await service.initiateCheckout(baseRequest);

        expect(result.reused).toBe(true);
        expect(result.provider).toBe('stripe');
      });

      it('PAID invoice blocks checkout', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
          id: 'inv-paid',
          status: InvoiceStatus.PAID,
          currency: 'USD',
          totalAmount: '2900',
          metadata: { type: 'SUBSCRIPTION', planId: 'plan-id', countryCode: 'US' },
        });

        await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(ConflictException);
        expect(mockInvoiceRepo.save).not.toHaveBeenCalled();
      });

      it('SUCCEEDED transaction blocks checkout even if invoice status lags', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        existingPendingInvoiceAndTx({ status: PaymentTransactionStatus.SUCCEEDED });

        await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(ConflictException);
      });

      it('FAILED transaction supersedes the old invoice and starts a fresh checkout', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        mockRoutingService.routeForCheckout.mockResolvedValueOnce({ provider: mockProvider, reason: 'preferred' });
        const { invoice } = existingPendingInvoiceAndTx({ status: PaymentTransactionStatus.FAILED });
        const savedInvoice = { id: 'inv-new', metadata: {} };
        const savedTx = { id: 'tx-new', status: PaymentTransactionStatus.PENDING, provider: 'stripe' };
        mockInvoiceRepo.create.mockReturnValue(savedInvoice);
        mockInvoiceRepo.save.mockResolvedValue(savedInvoice);
        mockTransactionRepo.create.mockReturnValue(savedTx);
        mockTransactionRepo.save.mockResolvedValue(savedTx);
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_retry', provider: 'stripe' });

        const result = await service.initiateCheckout(baseRequest);

        expect(mockInvoiceRepo.update).toHaveBeenCalledWith(
          invoice.id,
          expect.objectContaining({ status: InvoiceStatus.CANCELLED }),
        );
        expect(mockInvoiceRepo.save).toHaveBeenCalled();
        expect(result.invoiceId).toBe('inv-new');
        expect(result.reused).toBe(false);
      });

      it('CANCELLED transaction supersedes the old invoice and starts a fresh checkout', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        mockRoutingService.routeForCheckout.mockResolvedValueOnce({ provider: mockProvider, reason: 'preferred' });
        existingPendingInvoiceAndTx({ status: PaymentTransactionStatus.CANCELLED });
        mockInvoiceRepo.create.mockReturnValue({ id: 'inv-new2', metadata: {} });
        mockInvoiceRepo.save.mockResolvedValue({ id: 'inv-new2', metadata: {} });
        mockTransactionRepo.create.mockReturnValue({ id: 'tx-new2', status: PaymentTransactionStatus.PENDING, provider: 'stripe' });
        mockTransactionRepo.save.mockResolvedValue({ id: 'tx-new2', status: PaymentTransactionStatus.PENDING, provider: 'stripe' });
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_retry2', provider: 'stripe' });

        const result = await service.initiateCheckout(baseRequest);
        expect(result.invoiceId).toBe('inv-new2');
      });

      it('plan mismatch does not reuse an unrelated pending invoice', async () => {
        // The query filters by planId in SQL — simulate "no match" by returning null.
        mockFreshCheckoutHappyPath();
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_2', provider: 'stripe' });

        const result = await service.initiateCheckout({ ...baseRequest, planId: 'different-plan-id' });
        expect(result.reused).toBe(false);
        expect(mockInvoiceRepo.save).toHaveBeenCalled();
      });

      it('currency mismatch does not reuse a pending invoice for a different currency', async () => {
        mockFreshCheckoutHappyPath();
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_3', provider: 'stripe' });

        const result = await service.initiateCheckout({ ...baseRequest, currency: 'GHS' });
        expect(result.reused).toBe(false);
      });

      it('country mismatch does not reuse a pending invoice for a different country', async () => {
        mockFreshCheckoutHappyPath();
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_4', provider: 'stripe' });

        const result = await service.initiateCheckout({ ...baseRequest, countryCode: 'GH' });
        expect(result.reused).toBe(false);
      });

      it('stale amount (price changed since pending invoice was created) does not reuse', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '3500' }); // price increased
        mockRoutingService.routeForCheckout.mockResolvedValueOnce({ provider: mockProvider, reason: 'preferred' });
        existingPendingInvoiceAndTx(); // stale invoice still has totalAmount '2900'
        mockInvoiceRepo.create.mockReturnValue({ id: 'inv-fresh', metadata: {} });
        mockInvoiceRepo.save.mockResolvedValue({ id: 'inv-fresh', metadata: {} });
        mockTransactionRepo.create.mockReturnValue({ id: 'tx-fresh', status: PaymentTransactionStatus.PENDING, provider: 'stripe' });
        mockTransactionRepo.save.mockResolvedValue({ id: 'tx-fresh', status: PaymentTransactionStatus.PENDING, provider: 'stripe' });
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_fresh', provider: 'stripe' });

        const result = await service.initiateCheckout(baseRequest);
        expect(result.invoiceId).toBe('inv-fresh');
        expect(result.reused).toBe(false);
      });

      it('provider mismatch with an active session fails safely instead of switching', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        existingPendingInvoiceAndTx({
          status: PaymentTransactionStatus.PROCESSING,
          providerTransactionReference: 'psk_ref_999',
          providerPayloadSummary: { checkoutUrl: 'https://checkout.example/psk_ref_999' },
          provider: 'paystack',
        });

        await expect(
          service.initiateCheckout({ ...baseRequest, provider: 'stripe' }),
        ).rejects.toThrow(ConflictException);
        expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
      });
    });

    // ─── Concurrency / race safety ────────────────────────────────────────────

    describe('concurrency / race safety', () => {
      it('two concurrent requests racing to create the invoice: the loser reuses the winner (23505)', async () => {
        mockPlanRepo.findOne.mockResolvedValue({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValue({ amountCents: '2900' });
        mockRoutingService.routeForCheckout.mockResolvedValue({ provider: mockProvider, reason: 'preferred' });

        // First lookup (before insert attempt): nothing reusable yet for either caller.
        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce(null);

        const uniqueViolation = new QueryFailedError('INSERT', [], new Error('duplicate key value') as never);
        (uniqueViolation as unknown as { code: string }).code = '23505';
        mockInvoiceRepo.create.mockReturnValue({ id: 'inv-attempt', metadata: {} });
        mockInvoiceRepo.save.mockRejectedValueOnce(uniqueViolation);

        // Re-read after losing the race: the winning invoice + transaction.
        const winningInvoice = {
          id: 'inv-winner',
          status: InvoiceStatus.DRAFT,
          currency: 'USD',
          totalAmount: '2900',
          metadata: { type: 'SUBSCRIPTION', planId: 'plan-id', countryCode: 'US' },
        };
        const winningTx = {
          id: 'tx-winner',
          invoiceId: 'inv-winner',
          status: PaymentTransactionStatus.PENDING,
          provider: 'stripe',
          providerTransactionReference: null,
        };
        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce(winningInvoice);
        mockTransactionRepo.findOne.mockResolvedValueOnce(winningTx);
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_winner', provider: 'stripe' });

        const result = await service.initiateCheckout(baseRequest);

        expect(result.invoiceId).toBe('inv-winner');
        expect(result.transactionId).toBe('tx-winner');
        // Only ONE invoice ever gets persisted in the DB (the second save attempt failed with 23505).
        expect(mockInvoiceRepo.save).toHaveBeenCalledTimes(1);
      });

      it('two concurrent requests finding the same PENDING transaction: the loser gets a safe reused response', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
        mockRoutingService.routeForCheckout.mockResolvedValueOnce({ provider: mockProvider, reason: 'preferred' });

        const invoice = {
          id: 'inv-shared',
          status: InvoiceStatus.DRAFT,
          currency: 'USD',
          totalAmount: '2900',
          metadata: { type: 'SUBSCRIPTION', planId: 'plan-id', countryCode: 'US' },
        };
        const transaction = {
          id: 'tx-shared',
          invoiceId: 'inv-shared',
          status: PaymentTransactionStatus.PENDING,
          provider: 'stripe',
          providerTransactionReference: null,
        };
        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce(invoice);
        mockTransactionRepo.findOne.mockResolvedValueOnce(transaction);

        // The claim (conditional UPDATE) loses — another request already claimed it.
        mockTransactionRepo.update.mockResolvedValueOnce({ affected: 0 });
        mockTransactionRepo.findOne.mockResolvedValueOnce({
          ...transaction,
          status: PaymentTransactionStatus.PROCESSING,
          providerTransactionReference: 'psk_won_race',
          providerPayloadSummary: { checkoutUrl: 'https://checkout.example/won', sessionId: 'sess_won' },
        });

        const result = await service.initiateCheckout(baseRequest);

        expect(result.reused).toBe(true);
        expect(result.reason).toBe(CheckoutReason.PROVIDER_SESSION_REUSED);
        expect(result.checkoutUrl).toBe('https://checkout.example/won');
        expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
      });

      it('23505 race where the winning invoice exists but its transaction has not committed yet fails safely (never leaks the raw DB error)', async () => {
        // Audit fix: previously, if findReusableCheckout's re-read after a 23505 returned
        // 'supersede' or 'none' (e.g. the winner's invoice insert committed but its
        // transaction insert had not yet, since they are two separate non-atomic writes),
        // the code fell through to `throw err`, re-throwing the raw QueryFailedError.
        mockPlanRepo.findOne.mockResolvedValue({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValue({ amountCents: '2900' });
        mockRoutingService.routeForCheckout.mockResolvedValue({ provider: mockProvider, reason: 'preferred' });

        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce(null);

        const uniqueViolation = new QueryFailedError('INSERT', [], new Error('duplicate key value') as never);
        (uniqueViolation as unknown as { code: string }).code = '23505';
        mockInvoiceRepo.create.mockReturnValue({ id: 'inv-attempt', metadata: {} });
        mockInvoiceRepo.save.mockRejectedValueOnce(uniqueViolation);

        // Re-read after losing the race: the winner's invoice exists (DRAFT) but its
        // transaction row has not committed yet — findReusableCheckout's "data
        // inconsistency safety net" classifies this as 'supersede', not 'reuse'.
        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
          id: 'inv-winner-not-yet-ready',
          status: InvoiceStatus.DRAFT,
          currency: 'USD',
          totalAmount: '2900',
          metadata: { type: 'SUBSCRIPTION', planId: 'plan-id', countryCode: 'US' },
        });
        mockTransactionRepo.findOne.mockResolvedValueOnce(null);

        let caught: unknown;
        try {
          await service.initiateCheckout(baseRequest);
        } catch (err) {
          caught = err;
        }
        expect(caught).toBeInstanceOf(ConflictException);
        // Never the raw TypeORM/Postgres error type reaching the caller.
        expect(caught).not.toBeInstanceOf(QueryFailedError);
      });

      it('claim lost and no active session yet — fails safely with a retry-shortly message', async () => {
        mockFreshCheckoutHappyPath();
        mockTransactionRepo.update.mockResolvedValueOnce({ affected: 0 });
        mockTransactionRepo.findOne.mockResolvedValueOnce({
          id: 'tx-id',
          status: PaymentTransactionStatus.PROCESSING,
          provider: 'stripe',
          providerTransactionReference: null, // still no session — orphaned in-flight claim
        });

        await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(ConflictException);
        expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
      });
    });

    // ─── Provider failure recoverability ──────────────────────────────────────

    it('provider failure does not create a duplicate invoice on the next attempt', async () => {
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockRejectedValueOnce(new Error('Network error'));

      await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(BadRequestException);
      expect(mockInvoiceRepo.save).toHaveBeenCalledTimes(1);

      // Retry: the now-PENDING transaction from the failed attempt is reused.
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
      mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });
      mockRoutingService.routeForCheckout.mockResolvedValueOnce({ provider: mockProvider, reason: 'preferred' });
      mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
        id: 'inv-id',
        status: InvoiceStatus.DRAFT,
        currency: 'USD',
        totalAmount: '2900',
        metadata: { type: 'SUBSCRIPTION', planId: 'plan-id', countryCode: 'US' },
      });
      mockTransactionRepo.findOne.mockResolvedValueOnce({
        id: 'tx-id',
        invoiceId: 'inv-id',
        status: PaymentTransactionStatus.PENDING,
        provider: 'stripe',
        providerTransactionReference: null,
      });
      mockProvider.createCheckoutSession.mockResolvedValueOnce({ sessionId: 'sess_retry', provider: 'stripe' });

      const retryResult = await service.initiateCheckout(baseRequest);
      expect(retryResult.invoiceId).toBe('inv-id');
      expect(mockInvoiceRepo.save).toHaveBeenCalledTimes(1); // still only 1 invoice ever created
    });

    // ─── Idempotency key ──────────────────────────────────────────────────────

    describe('Idempotency-Key support', () => {
      it('same key + same params returns the same invoice/transaction without a new provider call', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });

        const expectedFingerprint = createHash('sha256')
          .update(
            JSON.stringify({
              userId: 'user-id',
              planId: 'plan-id',
              currency: 'USD',
              countryCode: 'US',
              paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
              amountMinor: '2900',
              provider: null,
            }),
          )
          .digest('hex');
        const keyHash = createHash('sha256').update('idem-key-1').digest('hex');

        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
          id: 'inv-idem',
          metadata: { idempotencyKeyHash: keyHash, idempotencyFingerprint: expectedFingerprint },
        });
        mockTransactionRepo.findOne.mockResolvedValueOnce({
          id: 'tx-idem',
          status: PaymentTransactionStatus.PROCESSING,
          provider: 'stripe',
          providerTransactionReference: 'psk_idem',
          providerPayloadSummary: { checkoutUrl: 'https://checkout.example/idem' },
        });

        const result = await service.initiateCheckout({ ...baseRequest, idempotencyKey: 'idem-key-1' });

        expect(result.invoiceId).toBe('inv-idem');
        expect(result.transactionId).toBe('tx-idem');
        expect(result.reused).toBe(true);
        expect(result.reason).toBe(CheckoutReason.IDEMPOTENCY_KEY_REPLAY);
        expect(mockRoutingService.routeForCheckout).not.toHaveBeenCalled();
        expect(mockInvoiceRepo.save).not.toHaveBeenCalled();
        expect(JSON.stringify(result)).not.toContain('idem-key-1');
      });

      it('same key + different params fails safely with ConflictException', async () => {
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900' });

        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
          id: 'inv-idem-2',
          metadata: { idempotencyKeyHash: 'somehash', idempotencyFingerprint: 'a-different-fingerprint' },
        });

        await expect(
          service.initiateCheckout({ ...baseRequest, idempotencyKey: 'idem-key-2' }),
        ).rejects.toThrow(ConflictException);
        expect(mockInvoiceRepo.save).not.toHaveBeenCalled();
      });

      it('new idempotency key stores only a hash, never the raw key, on the invoice metadata', async () => {
        mockFreshCheckoutHappyPath();
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_idem_new', provider: 'stripe' });

        await service.initiateCheckout({ ...baseRequest, idempotencyKey: 'raw-secret-key-value' });

        const createCallArg = mockInvoiceRepo.create.mock.calls[0][0];
        expect(JSON.stringify(createCallArg.metadata)).not.toContain('raw-secret-key-value');
        expect(createCallArg.metadata.idempotencyKeyHash).toBeDefined();
      });

      it('same key + same params but a price change since the original request fails safely (409), never replays a stale-priced session', async () => {
        // Audit fix: the fingerprint now includes amountMinor, so a mid-flight price
        // change is correctly treated as "different parameters" for idempotency purposes.
        mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
        mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '3500' }); // price increased since original request

        const originalFingerprint = createHash('sha256')
          .update(
            JSON.stringify({
              userId: 'user-id',
              planId: 'plan-id',
              currency: 'USD',
              countryCode: 'US',
              paymentPurpose: PaymentPurpose.SUBSCRIPTION_INITIAL,
              amountMinor: '2900', // original (now stale) price
              provider: null,
            }),
          )
          .digest('hex');
        const keyHash = createHash('sha256').update('idem-key-price-change').digest('hex');

        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce({
          id: 'inv-idem-stale-price',
          metadata: { idempotencyKeyHash: keyHash, idempotencyFingerprint: originalFingerprint },
        });

        await expect(
          service.initiateCheckout({ ...baseRequest, idempotencyKey: 'idem-key-price-change' }),
        ).rejects.toThrow(ConflictException);
        expect(mockInvoiceRepo.save).not.toHaveBeenCalled();
        expect(mockProvider.createCheckoutSession).not.toHaveBeenCalled();
      });

      it('the same idempotency key value used by a different user never matches this user\'s invoice (scoped by userId)', async () => {
        mockFreshCheckoutHappyPath();
        mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_cross_user', provider: 'stripe' });

        // The repo mock is scoped per-call via the query builder chain; since the real
        // query filters `i.user_id = :userId`, a lookup for THIS user must return null
        // even though another user may hold an invoice with the same key hash. We
        // simulate that by returning null (as the real scoped SQL would for this user)
        // and asserting a brand-new checkout is created rather than any cross-user reuse.
        mockInvoiceQueryBuilder.getOne.mockResolvedValueOnce(null);

        const result = await service.initiateCheckout({
          ...baseRequest,
          idempotencyKey: 'shared-key-used-by-another-user',
        });

        expect(mockInvoiceQueryBuilder.where).toHaveBeenCalledWith('i.user_id = :userId', { userId: 'user-id' });
        expect(result.reused).toBe(false);
        expect(result.invoiceId).toBe('inv-id');
      });
    });

    // ─── Security ──────────────────────────────────────────────────────────────

    it('never includes secrets in the checkout response', async () => {
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockResolvedValue({
        sessionId: 'sess_safe',
        checkoutUrl: 'https://stripe.com/pay/sess_safe',
        provider: 'stripe',
      });

      const result = await service.initiateCheckout(baseRequest);
      const serialized = JSON.stringify(result);
      expect(serialized).not.toMatch(/sk_(live|test)_/);
      expect(serialized).not.toContain('Authorization');
    });

    it('never includes secrets in audit metadata', async () => {
      mockFreshCheckoutHappyPath();
      mockProvider.createCheckoutSession.mockResolvedValue({ sessionId: 'sess_audit', provider: 'stripe' });

      await service.initiateCheckout(baseRequest);

      for (const call of mockAuditService.log.mock.calls) {
        expect(JSON.stringify(call[0].metadata ?? {})).not.toMatch(/sk_(live|test)_/);
      }
    });
  });

  // ─── cancelSubscription ───────────────────────────────────────────────────

  describe('cancelSubscription', () => {
    it('should throw NotFoundException if no subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.cancelSubscription('user-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if already cancelled', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.CANCELLED,
        id: 'sub-id',
      });
      await expect(service.cancelSubscription('user-id')).rejects.toThrow(BadRequestException);
    });

    it('should cancel active subscription', async () => {
      const sub = {
        id: 'sub-id',
        status: SubscriptionStatus.ACTIVE,
        metadata: {},
        paymentProvider: 'stripe',
      };
      mockSubscriptionRepo.findOne.mockResolvedValueOnce(sub);
      mockSubscriptionRepo.save.mockResolvedValueOnce({ ...sub, status: SubscriptionStatus.CANCELLED });

      const result = await service.cancelSubscription('user-id', 'No longer needed');
      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'SUBSCRIPTION_CANCELLED' }),
      );
    });
  });

  // ─── manualActivate ───────────────────────────────────────────────────────

  describe('manualActivate', () => {
    it('should throw NotFoundException when plan not found', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.manualActivate('user-id', 'invalid-plan-id', 'admin-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should create a new subscription when none exists', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro' });
      mockSubscriptionRepo.findOne.mockResolvedValueOnce(null);
      const mockSaved = { id: 'sub-id', status: SubscriptionStatus.ACTIVE };
      mockSubscriptionRepo.create.mockReturnValue(mockSaved);
      mockSubscriptionRepo.save.mockResolvedValueOnce(mockSaved);

      const result = await service.manualActivate('user-id', 'plan-id', 'admin-id');
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'SUBSCRIPTION_MANUAL_ACTIVATED',
          metadata: expect.objectContaining({
            warning: expect.stringContaining('DEV/TEST only'),
          }),
        }),
      );
    });
  });

  // ─── Subscription gate regression ─────────────────────────────────────────

  describe('Subscription gate regression — AI Auto Trading', () => {
    it('active paid subscription allows AI Auto Trading', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 7 * 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(true);
    });

    it('failed payment (no subscription) blocks AI Auto Trading', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce(null);
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('expired subscription blocks AI Auto Trading', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() - 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('cancelled subscription blocks AI Auto Trading', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.CANCELLED,
        plan: { allowsAiAutoTrading: true },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });

    it('plan that does not allow AI Auto Trading blocks even with active subscription', async () => {
      mockSubscriptionRepo.findOne.mockResolvedValueOnce({
        status: SubscriptionStatus.ACTIVE,
        plan: { allowsAiAutoTrading: false },
        currentPeriodEnd: new Date(Date.now() + 86400000),
      });
      expect(await service.canUserStartAiAutoTrading('user-id')).toBe(false);
    });
  });
});
