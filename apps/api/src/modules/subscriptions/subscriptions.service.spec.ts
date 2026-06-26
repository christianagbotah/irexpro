import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionPlan } from './entities/subscription-plan.entity';
import { PlanPricing } from './entities/plan-pricing.entity';
import { UserSubscription, SubscriptionStatus } from './entities/user-subscription.entity';
import { Invoice } from '../payments/entities/invoice.entity';
import { PaymentTransaction } from '../payments/entities/payment-transaction.entity';
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
const mockInvoiceRepo = {
  create: jest.fn(),
  save: jest.fn(),
};
const mockTransactionRepo = {
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
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

    // Re-wire the query builder chain
    mockPricingRepo.createQueryBuilder.mockReturnValue(mockPricingRepo);

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
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
      mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900', subscriptionPlanId: 'plan-id' });
      mockRoutingService.routeForCheckout.mockResolvedValueOnce({
        provider: mockProvider,
        reason: 'preferred',
      });
      const savedInvoice = { id: 'inv-id' };
      const savedTx = { id: 'tx-id' };
      mockInvoiceRepo.create.mockReturnValue(savedInvoice);
      mockInvoiceRepo.save.mockResolvedValue(savedInvoice);
      mockTransactionRepo.create.mockReturnValue(savedTx);
      mockTransactionRepo.save.mockResolvedValue(savedTx);
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
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
      mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900', subscriptionPlanId: 'plan-id' });
      mockRoutingService.routeForCheckout.mockResolvedValueOnce({
        provider: mockProvider,
        reason: 'country_config',
      });
      const savedInvoice = { id: 'inv-id' };
      const savedTx = { id: 'tx-id' };
      mockInvoiceRepo.create.mockReturnValue(savedInvoice);
      mockInvoiceRepo.save.mockResolvedValue(savedInvoice);
      mockTransactionRepo.create.mockReturnValue(savedTx);
      mockTransactionRepo.save.mockResolvedValue(savedTx);
      mockProvider.createCheckoutSession.mockResolvedValue({
        sessionId: 'sess_456',
        provider: 'stripe',
      });

      await service.initiateCheckout(baseRequest);

      expect(mockRoutingService.routeForCheckout).toHaveBeenCalledWith('US', 'USD', undefined);
    });

    it('should audit PAYMENT_CHECKOUT_FAILED when provider throws', async () => {
      mockPlanRepo.findOne.mockResolvedValueOnce({ id: 'plan-id', name: 'Pro', isActive: true });
      mockPricingRepo.getOne.mockResolvedValueOnce({ amountCents: '2900', subscriptionPlanId: 'plan-id' });
      mockRoutingService.routeForCheckout.mockResolvedValueOnce({
        provider: mockProvider,
        reason: 'preferred',
      });
      const savedInvoice = { id: 'inv-id' };
      const savedTx = { id: 'tx-id' };
      mockInvoiceRepo.create.mockReturnValue(savedInvoice);
      mockInvoiceRepo.save.mockResolvedValue(savedInvoice);
      mockTransactionRepo.create.mockReturnValue(savedTx);
      mockTransactionRepo.save.mockResolvedValue(savedTx);
      mockProvider.createCheckoutSession.mockRejectedValue(new Error('Provider error'));

      await expect(service.initiateCheckout(baseRequest)).rejects.toThrow(BadRequestException);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PAYMENT_CHECKOUT_FAILED' }),
      );
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
